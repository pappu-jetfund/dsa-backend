import { CardCompleted, CUSTOMER_JOURNEY_CONFIG, CustomerJourneyStep, DomainJourneyConfig } from "../common/config/customer-journey.config";


export type StepStatus = 'completed' | 'pending' | 'skipped';

export function getJourneyConfig(domain: string): DomainJourneyConfig {
  return CUSTOMER_JOURNEY_CONFIG[domain] || CUSTOMER_JOURNEY_CONFIG['default'];
}

export function resolveBankRequired( domain: string, preofferDecision: string | null, riskGrade: unknown, ): boolean {
  const d = domain?.toLowerCase() ?? '';

  if (d.includes('jetfund')) {
    return preofferDecision === 'Proceed to Bank';
  }
  if (d.includes('cashmysalary')) {
    const n = Number(riskGrade);
    return !isNaN(n) && n > 1;
  }
  return true;
}

export function buildJourney( config: DomainJourneyConfig, cardCompleted: CardCompleted, isBankRequired: boolean, ) {
  const steps = config.steps.map((step, index) => {
    const required = step.key === 'bankVerification' ? isBankRequired : true;

    const completed = cardCompleted[step.key];

    const status: StepStatus = !required ? 'skipped' : completed ? 'completed' : 'pending';

    return {
      step: index + 1,
      key: step.key,
      title: step.title,
      required,
      status,
      completed,
    };
  });

  const totalSteps = steps.length;

  // Disbursed is the final business state.
  // Once disbursed, it should be shown as the current stage
  // even if some earlier card data is incomplete/inconsistent.
  const disbursedIdx = steps.findIndex(
    (step) => step.key === 'disbursed',
  );

  if (cardCompleted.disbursed && disbursedIdx !== -1) {
    const currentStep = disbursedIdx + 1;

    return {
      steps,
      currentStep,
      totalSteps,
      completionPercentage: Math.round(
        (currentStep / totalSteps) * 100,
      ),
      currentStageKey: steps[disbursedIdx].key,
      currentStageTitle: steps[disbursedIdx].title,
    };
  }

  const lastCompletedIdx = steps.reduce(
    (lastIdx, step, index) => {
      if (step.status === 'completed') {
        return index;
      }

      return lastIdx;
    },
    -1,
  );

  const currentStageIdx = lastCompletedIdx + 1;

  const currentStep = currentStageIdx < steps.length ? currentStageIdx + 1 : steps.length;

  const currentStage = currentStageIdx < steps.length ? steps[currentStageIdx] : null;

  return {
    steps,
    currentStep,
    totalSteps,
    completionPercentage: totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0,
    currentStageKey: currentStage?.key ?? 'completed',
    currentStageTitle: currentStage?.title ?? 'Journey Completed',
  };
}