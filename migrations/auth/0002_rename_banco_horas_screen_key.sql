-- A tela /secullum/banco-horas-copa virou /secullum/banco-horas. As permissões de
-- papel guardam o href da tela, então sem esse rename os papéis não-admin que já
-- tinham a tela liberada perderiam o acesso (e o item some do menu).
INSERT OR IGNORE INTO role_permissions (role_id, screen_key)
SELECT role_id, '/secullum/banco-horas'
FROM role_permissions
WHERE screen_key = '/secullum/banco-horas-copa';

DELETE FROM role_permissions WHERE screen_key = '/secullum/banco-horas-copa';
