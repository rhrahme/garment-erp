-- Run in Supabase → SQL Editor to confirm hagan.qc@gmail.com manually
update auth.users
set
  email_confirmed_at = timezone('utc', now()),
  confirmed_at = timezone('utc', now())
where lower(email) = 'hagan.qc@gmail.com';
