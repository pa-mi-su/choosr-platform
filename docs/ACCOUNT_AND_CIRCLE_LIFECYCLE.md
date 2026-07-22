# Choosr account and Circle lifecycle

This is the initial operating policy for UAT. It keeps social relationships
reversible without destroying room history.

## Circle relationship states

- `pending`: one user sent a request; the recipient may accept or decline it.
- `accepted`: both users can create and send rooms through their Circle.
- `declined`: the request remains as an audit record but is not shown as a
  usable Circle relationship.
- `removed`: either user removed the relationship. Pending invitations are
  cancelled, the person disappears from both Circle lists, and previous rooms
  remain intact.

Removing a Circle member never deletes either Supabase Auth user, either
profile, any completed room, or historical swipes.

## Account states

- **Active:** normal Supabase Auth user and profile.
- **Suspended:** initially managed by an authorized operator in Supabase Auth.
  A suspended user cannot obtain a valid session, but historical rooms remain.
- **Deleted:** an explicit administrative action. Auth-owned personal data is
  removed through existing foreign-key rules. This is not the same operation
  as removing somebody from a Circle.

## Administration during UAT

Account suspension or deletion is performed only in the Supabase dashboard by
an authorized project administrator. Choosr does not expose destructive account
administration in the mobile client. A dedicated internal admin interface can
be added after UAT establishes the required roles, audit log, and recovery
policy.
