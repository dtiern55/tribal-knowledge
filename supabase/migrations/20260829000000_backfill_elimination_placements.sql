-- Backfill placements for anyone eliminated without one (#487).
--
-- Placement was only ever written by the survivoR import's PATCH, so
-- eliminations recorded through the admin UI left it null and the Cast page
-- fell back to "ep N". The API now derives it on every elimination; this
-- catches the rows that predate that.
with ordered as (
  select c.id,
         (select count(*) from contestants c2 where c2.season_id = c.season_id)
           - row_number() over (
               partition by c.season_id order by ep.episode_number, e.created_at
             ) + 1 as placement
  from contestants c
  join eliminations e on e.contestant_id = c.id
  join episodes ep on ep.id = e.episode_id
)
update contestants c
   set placement = o.placement
  from ordered o
 where c.id = o.id
   and c.placement is null
   -- 1-3 are finale outcomes; deriving them from boot order would have the
   -- placement trigger award won_season to someone who was voted out.
   and o.placement > 3
   and not exists (
     select 1 from contestants c2
      where c2.season_id = c.season_id and c2.placement = o.placement
   );
