create table episode_insights (
    id uuid primary key default gen_random_uuid(),
    episode_id uuid not null references episodes(id) on delete cascade,
    insight_type text not null check (insight_type in (
        'pick_popularity', 'multiple_correct_ballots',
        'performance_vs_median', 'weekly_play_usage'
    )),
    contestant_id uuid references contestants(id) on delete cascade,
    advantage_type text,
    display_order int not null check (display_order between 0 and 2),
    created_at timestamptz not null default now(),
    unique (episode_id, display_order),
    check (
        (insight_type = 'pick_popularity' and contestant_id is not null
         and advantage_type is null)
        or (insight_type = 'weekly_play_usage' and contestant_id is null
            and advantage_type in (
                'double_roster_points', 'double_vote_points', 'roster_swap'
            ))
        or (insight_type in ('multiple_correct_ballots', 'performance_vs_median')
            and contestant_id is null and advantage_type is null)
    )
);

create unique index episode_insights_unique_selection
on episode_insights (
    episode_id, insight_type, coalesce(contestant_id::text, ''),
    coalesce(advantage_type, '')
);

-- FastAPI's service role is the only data path. In particular, clients must
-- not read aggregate configuration before the scored-result boundary.
alter table episode_insights enable row level security;
