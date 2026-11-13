-- Run after zero-cache has created its upstream schema. Local QA only.
-- Zero 1.8's server adapter records mutation acknowledgements in these tables.
GRANT USAGE ON SCHEMA pulsar_design_local_0 TO pulsar_app;
GRANT SELECT, INSERT, UPDATE
  ON pulsar_design_local_0.clients TO pulsar_app;
GRANT INSERT, DELETE
  ON pulsar_design_local_0.mutations TO pulsar_app;
