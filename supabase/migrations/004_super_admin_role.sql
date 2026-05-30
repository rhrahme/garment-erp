-- Super admin role — full system access including destructive client deletes
alter type user_role add value if not exists 'super_admin';
