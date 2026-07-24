-- Factory manager: wash→iron→cut→finish→hand-to-driver visibility/advance; no prices or accounting.
alter type user_role add value if not exists 'production_operator';
