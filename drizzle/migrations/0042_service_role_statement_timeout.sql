ALTER ROLE service_role SET statement_timeout = '120s';
NOTIFY pgrst, 'reload config';