-- The approval check runs in an AFTER UPDATE trigger. It must see the
-- newly approved request row written by that same SQL statement.
alter function private.project_delete_approval_active(bigint) volatile;
