-- Four results-card tiles, not three (#911): they sit two to a row on a phone.
alter table episode_insights
    drop constraint episode_insights_display_order_check,
    add constraint episode_insights_display_order_check
        check (display_order between 0 and 3);
