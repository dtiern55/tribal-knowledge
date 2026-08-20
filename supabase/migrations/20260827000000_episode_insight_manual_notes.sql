-- Free-form commissioner notes on the reveal (#492). Manual notes carry their
-- own label/value/detail text instead of a computed aggregate, and render
-- identically to the auto insights.
alter table episode_insights
    add column label text,
    add column value text,
    add column detail text;

alter table episode_insights
    drop constraint episode_insights_insight_type_check,
    drop constraint episode_insights_check;

alter table episode_insights
    add constraint episode_insights_insight_type_check check (
        insight_type in (
            'pick_popularity', 'multiple_correct_ballots',
            'performance_vs_median', 'weekly_play_usage', 'manual_note'
        )
    ),
    add constraint episode_insights_check check (
        (insight_type = 'pick_popularity' and contestant_id is not null
         and advantage_type is null and label is null)
        or (insight_type = 'weekly_play_usage' and contestant_id is null
            and advantage_type in (
                'double_roster_points', 'double_vote_points', 'roster_swap'
            ) and label is null)
        or (insight_type in ('multiple_correct_ballots', 'performance_vs_median')
            and contestant_id is null and advantage_type is null and label is null)
        or (insight_type = 'manual_note' and contestant_id is null
            and advantage_type is null and label is not null and value is not null)
    );

-- Computed insights dedupe on their (type, target); manual notes are distinct
-- free text, so exempt them from the selection uniqueness.
drop index episode_insights_unique_selection;
create unique index episode_insights_unique_selection
on episode_insights (
    episode_id, insight_type, coalesce(contestant_id::text, ''),
    coalesce(advantage_type, '')
)
where insight_type <> 'manual_note';
