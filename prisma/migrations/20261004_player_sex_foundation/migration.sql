BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TYPE public.player_sex AS ENUM ('MALE', 'FEMALE');

ALTER TABLE public.players
  ADD COLUMN sex public.player_sex NULL;

COMMIT;
