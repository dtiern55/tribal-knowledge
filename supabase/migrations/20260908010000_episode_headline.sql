-- The results card's headline, set by the commissioner for the episode.
-- Null falls back to the computed one ("<name>'s torch was snuffed"), which
-- cannot tell a Redemption Island trip from leaving the game.
alter table episodes add column headline text;
