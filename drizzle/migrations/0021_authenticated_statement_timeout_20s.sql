ALTER ROLE authenticated SET statement_timeout = '20s';
NOTIFY pgrst, 'reload config';