import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';

import { DedupeService } from './dedupe.service';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import * as fs from 'fs';
import * as path from 'path';

@Controller('dedupe')
export class DedupeController {
  constructor(private DedupeService: DedupeService) { }

  @UseGuards(AuthGuard)
  @Post('panLookup')
  async panLookup(@Body() body: any,
    @Req() req: Request,) {
    return await this.DedupeService.panLookup(body, req);
  }

  // @Get('dataMigration')
  // async dataMigration(@Body() body: any) {
  //   return await this.DedupeService.dataMigration(body);
  // }


  @Post('webhook-fineye')
  async handleWebhookfineye(
    @Body() body: any,
    @Query('clienttrnxid') clienttrnxid: string,
  ) {

    console.log(clienttrnxid, "Query");

    console.log('yes we are here');
    const logsDir = path.join(process.cwd(), 'logs', 'webhooksfineye');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // file name by date
    const filePath = path.join(
      logsDir,
      `cams-${new Date().toISOString().split('T')[0]}.log`,
    );

    // append webhook payload
    fs.appendFileSync(
      filePath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          payload: body,
        },
        null,
        2,
      ) + '\n\n====================================\n\n',
    );

    return this.DedupeService.handleFinEyeWebhook(body, clienttrnxid);
  }
}
