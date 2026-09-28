import 'reflect-metadata';
import 'dotenv/config';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { ApiErrorFilter, SessionGuard } from './common';
import { PrismaService } from './prisma.service';
import { AuthController } from './auth';
import { MesController, HealthController, BomController, MaterialController } from './mes.controller';
import { MesService } from './mes.service';
import { BomService } from './bom.service';
import { MaterialService } from './material.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({ controllers: [AuthController, MesController, BomController, MaterialController, AiController, HealthController], providers: [PrismaService, SessionGuard, MesService, BomService, MaterialService, AiService] })
class AppModule implements NestModule { configure(consumer: MiddlewareConsumer) { consumer.apply((req: any, res: any, next: () => void) => { req.requestId = req.headers['x-request-id'] || randomUUID(); res.setHeader('X-Request-Id', req.requestId); next(); }).forRoutes('*'); } }

async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(cookieParser()); app.useGlobalFilters(new ApiErrorFilter()); app.enableCors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:4400', credentials: true });
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(Number(process.env.PORT || 4401), host);
  console.log(`MES API ready on ${host}:${process.env.PORT || 4401}`);
}
main().catch(error => { console.error(error); process.exit(1); });
