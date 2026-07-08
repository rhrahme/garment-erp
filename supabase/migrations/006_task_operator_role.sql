-- Production-floor role: print labels/A4 and fabric wash/iron scan; no prices or order editing
alter type user_role add value if not exists 'task_operator';
