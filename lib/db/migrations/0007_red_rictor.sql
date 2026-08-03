ALTER TABLE "User" ADD COLUMN "unpriceCustomerId" varchar(64);--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_unpriceCustomerId_unique" UNIQUE("unpriceCustomerId");