-- Tablet sales role: client/order/invoice access with supplier and production costs hidden.
alter type user_role add value if not exists 'sales_operator';
