ALTER TABLE "security_event" ADD COLUMN "geo_country" text;--> statement-breakpoint
ALTER TABLE "security_event" ADD COLUMN "geo_city" text;--> statement-breakpoint
ALTER TABLE "security_event" ADD COLUMN "geo_lat" double precision;--> statement-breakpoint
ALTER TABLE "security_event" ADD COLUMN "geo_lon" double precision;