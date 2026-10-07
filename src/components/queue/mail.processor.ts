import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailService } from '../mail/mail.service';

interface MailJob {
    to: string;
    subject: string;
    type: any;
    template: string;
    data: any;
}

// @Processor('mail-queue', { concurrency: 10 })
// export class MailProcessor extends WorkerHost {
//     constructor(
//         private readonly mailService: MailService,
//     ) {
//         super();
//     }

//     async process(job: any) {
//         try {
//             console.log(job.data, "job.data");

//             const { to, subject, type, template, data } = job.data;

//             await this.mailService.sendCustomMail(
//                 to,
//                 subject,
//                 type,
//                 template,
//                 data,
//             );
//         } catch (err) {
//             console.error(`❌ Mail Job Failed: ${job.id}`, err);
//             throw err;
//         }
//     }
// }