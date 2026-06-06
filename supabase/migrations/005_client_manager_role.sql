-- Restricted role: clients module only, no contact fields in UI/API
alter type user_role add value if not exists 'client_manager';
