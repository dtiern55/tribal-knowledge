-- Mark the practice bots explicitly (#595 follow-up). The first 17 bot
-- accounts were minted on the commissioner's own address, so nothing
-- email-based can tell them from a real player: the leagues migration
-- enrolled them in the first league by mistake, and the bot driver could
-- not find them. is_bot is the durable marker for both.
alter table profiles add column is_bot boolean not null default false;

update profiles p set is_bot = true
from auth.users u
where u.id = p.id
  and (u.email like 'bot-%@tribal.local'
       or p.display_name ~ '^(Consensus|Reader|Contrarian|Roster Loyalist|Vote Gambler) \d+$');

-- Bots play in leagues of their own; take them back out of the first one.
delete from league_members m using profiles p
where p.id = m.user_id and p.is_bot;
