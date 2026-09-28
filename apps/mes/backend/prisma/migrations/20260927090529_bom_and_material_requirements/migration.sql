-- AlterTable
ALTER TABLE "ProductionPlan" ADD COLUMN     "bomId" TEXT;

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomItem" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "componentSku" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '件',
    "quantityPerUnit" DECIMAL(18,3) NOT NULL,
    "scrapRate" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BomItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "componentSku" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "requiredQty" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "PlanMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bom_tenantId_status_productSku_idx" ON "Bom"("tenantId", "status", "productSku");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_tenantId_productSku_revision_key" ON "Bom"("tenantId", "productSku", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "BomItem_bomId_componentSku_key" ON "BomItem"("bomId", "componentSku");

-- CreateIndex
CREATE INDEX "PlanMaterial_tenantId_planId_idx" ON "PlanMaterial"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanMaterial_planId_componentSku_key" ON "PlanMaterial"("planId", "componentSku");

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomItem" ADD CONSTRAINT "BomItem_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMaterial" ADD CONSTRAINT "PlanMaterial_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProductionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
