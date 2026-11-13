-- Zero 1.8 acknowledges custom mutations in its upstream shard schema.
-- Keep cache administration tables and application authorization unchanged.
BEGIN;
GRANT USAGE ON SCHEMA pulsar_production_0 TO pulsar_app;
GRANT SELECT, INSERT, UPDATE
  ON pulsar_production_0.clients TO pulsar_app;
GRANT INSERT, DELETE
  ON pulsar_production_0.mutations TO pulsar_app;
COMMIT;
