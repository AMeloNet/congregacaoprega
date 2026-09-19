import {
  Controller,
  Get,
  HttpCode,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseHealth {
  async isReady(): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 1_000,
      max: 1,
    });
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      await pool.end();
    }
  }
}

@Controller('health')
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealth) {}

  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  async ready(): Promise<{ status: 'ok' }> {
    if (!(await this.databaseHealth.isReady())) {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
    return { status: 'ok' };
  }
}
