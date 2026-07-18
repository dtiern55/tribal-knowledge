-- Cap display names at 40 chars: longer names push the standings score
-- columns off screen. Trim existing rows first so the constraint validates.
update profiles set display_name = left(display_name, 40)
where char_length(display_name) > 40;

alter table profiles
  add constraint display_name_max_length check (char_length(display_name) <= 40);
