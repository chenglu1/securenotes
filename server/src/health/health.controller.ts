import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ok } from '../common/http/api-response';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async getHealth() {
    try {
      await this.dataSource.query('SELECT 1');

      return ok({
        status: 'ok',
        database: 'up',
      });
    } catch {
      throw new ServiceUnavailableException({
        message: 'Database unavailable',
        data: {
          status: 'error',
          database: 'down',
        },
      });
    }
  }
}