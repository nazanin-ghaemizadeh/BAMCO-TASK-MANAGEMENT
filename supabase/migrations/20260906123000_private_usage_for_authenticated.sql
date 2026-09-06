-- Required for authenticated callers of explicitly granted helper functions
-- such as private.is_manager(). Objects remain inaccessible unless separately granted.
grant usage on schema private to authenticated;
