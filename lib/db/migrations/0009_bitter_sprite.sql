ALTER TABLE "User" ADD COLUMN "unpriceProvisioningStatus" varchar DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "unpriceProvisioningError" varchar(160);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "unpriceProvisioningStartedAt" timestamp;--> statement-breakpoint
UPDATE "User" SET "unpriceProvisioningStatus" = 'ready' WHERE "unpriceCustomerId" IS NOT NULL;
