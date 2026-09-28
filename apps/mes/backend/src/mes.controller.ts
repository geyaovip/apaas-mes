import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthRequest, SessionGuard } from './common';
import { PrismaService } from './prisma.service';
import { MesService } from './mes.service';
import { BomService } from './bom.service';
import { MaterialService } from './material.service';

@Controller('api/v1') @UseGuards(SessionGuard)
export class MesController {
  constructor(private mes: MesService) {}
  @Get('plans') listPlans(@Req() r: AuthRequest, @Query() q: Record<string, unknown>) { return this.mes.listPlans(r.actor, q); }
  @Post('plans') createPlan(@Req() r: AuthRequest, @Body() b: unknown) { return this.mes.createPlan(r.actor, b); }
  @Get('plans/:id') getPlan(@Req() r: AuthRequest, @Param('id') id: string) { return this.mes.getPlan(r.actor, id); }
  @Post('plans/:id/release') releasePlan(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.mes.releasePlan(r.actor, id, b); }
  @Post('plans/:id/orders') createOrder(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.mes.createOrder(r.actor, id, b); }
  @Get('orders') listOrders(@Req() r: AuthRequest, @Query() q: Record<string, unknown>) { return this.mes.listOrders(r.actor, q); }
  @Get('orders/:id') getOrder(@Req() r: AuthRequest, @Param('id') id: string) { return this.mes.getOrder(r.actor, id); }
  @Post('orders/:id/reports') createReport(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.mes.createReport(r.actor, id, b); }
  @Get('reports/pending') pending(@Req() r: AuthRequest) { return this.mes.listPendingReports(r.actor); }
  @Post('reports/:id/review') review(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.mes.reviewReport(r.actor, id, b); }
  @Get('dashboard') dashboard(@Req() r: AuthRequest) { return this.mes.dashboard(r.actor); }
  @Get('admin/users') users(@Req() r: AuthRequest) { return this.mes.listUsers(r.actor); }
  @Post('admin/users') createUser(@Req() r: AuthRequest, @Body() b: unknown) { return this.mes.createUser(r.actor, b); }
}

@Controller('api/v1/boms') @UseGuards(SessionGuard)
export class BomController {
  constructor(private boms: BomService) {}
  @Get('page') listPage(@Req() r: AuthRequest, @Query() q: Record<string,unknown>) { return this.boms.listPage(r.actor,q); }
  @Get() list(@Req() r: AuthRequest) { return this.boms.list(r.actor); }
  @Post() create(@Req() r: AuthRequest, @Body() b: unknown) { return this.boms.create(r.actor, b); }
  @Get(':id') get(@Req() r: AuthRequest, @Param('id') id: string) { return this.boms.get(r.actor, id); }
  @Post(':id/release') release(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.boms.release(r.actor, id, b); }
}

@Controller('api/v1/materials') @UseGuards(SessionGuard)
export class MaterialController {
  constructor(private materials: MaterialService) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: Record<string, unknown>) { return this.materials.list(r.actor, q); }
  @Post() create(@Req() r: AuthRequest, @Body() b: unknown) { return this.materials.create(r.actor, b); }
  @Get(':id') get(@Req() r: AuthRequest, @Param('id') id: string) { return this.materials.get(r.actor, id); }
  @Patch(':id') update(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: unknown) { return this.materials.update(r.actor, id, b); }
}

@Controller('api/v1') export class HealthController { constructor(private db: PrismaService) {} @Get('health') async health() { await this.db.$queryRaw`SELECT 1`; return { ok: true, database: 'ready' }; } }
