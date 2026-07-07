#!/usr/bin/env python3
"""
Diagnóstico: compara contagens com diferentes filtros para identificar
por que o script Python encontra menos registros que o admin PHP.
"""

import os
import mysql.connector
from dotenv import dotenv_values

_ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
_config = dotenv_values(_ENV_PATH)

db = mysql.connector.connect(
    host=_config["DB_HOST"],
    port=int(_config.get("DB_PORT", 3306)),
    user=_config["DB_USER"],
    password=_config["DB_PASS"],
    database=_config["DB_NAME"],
)
cursor = db.cursor(dictionary=True)

queries = {
    "1. Query EXATA do script Python (emissor=Omie, status=APPROVED, numero_nfs IS NULL, deleted=0)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.status = 'APPROVED'
          AND n.emissor = 'Omie'
          AND n.numero_nfs IS NULL
          AND p.deleted = 0
    """,
    "2. Sem filtro de emissor (qualquer emissor)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.status = 'APPROVED'
          AND n.numero_nfs IS NULL
          AND p.deleted = 0
    """,
    "3. Sem filtro de status (qualquer status)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.emissor = 'Omie'
          AND n.numero_nfs IS NULL
          AND p.deleted = 0
    """,
    "4. Sem filtro de emissor NEM status": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.numero_nfs IS NULL
          AND p.deleted = 0
    """,
    "5. Incluindo deleted (sem filtro deleted)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE n.status = 'APPROVED'
          AND n.emissor = 'Omie'
          AND n.numero_nfs IS NULL
    """,
    "6. LEFT JOIN tb_nfs (pagamentos sem NFS vinculada)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        LEFT JOIN tb_nfs n ON n.id = p.id_nfs
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE (n.numero_nfs IS NULL OR p.id_nfs IS NULL OR p.id_nfs = 0)
          AND p.deleted = 0
    """,
    "7. Pagamentos com id_nfs = 0 ou NULL (sem NFS criada)": """
        SELECT COUNT(*) AS total
        FROM tb_pagamento p
        JOIN tb_cliente c ON c.id = p.id_cliente
        WHERE (p.id_nfs IS NULL OR p.id_nfs = 0)
          AND p.deleted = 0
    """,
}

print("=" * 70)
print("  Diagnóstico de contagem — NFS Massivo")
print("=" * 70)

for label, sql in queries.items():
    cursor.execute(sql)
    row = cursor.fetchone()
    print(f"\n  {label}")
    print(f"    → {row['total']} registros")

# Detalhamento por emissor e status
print("\n" + "=" * 70)
print("  Distribuição por emissor (numero_nfs IS NULL, deleted=0)")
print("=" * 70)
cursor.execute("""
    SELECT n.emissor, COUNT(*) AS total
    FROM tb_pagamento p
    JOIN tb_nfs n ON n.id = p.id_nfs
    WHERE n.numero_nfs IS NULL AND p.deleted = 0
    GROUP BY n.emissor
    ORDER BY total DESC
""")
for row in cursor.fetchall():
    print(f"    {row['emissor']}: {row['total']}")

print("\n" + "=" * 70)
print("  Distribuição por status (numero_nfs IS NULL, deleted=0)")
print("=" * 70)
cursor.execute("""
    SELECT n.status, n.emissor, COUNT(*) AS total
    FROM tb_pagamento p
    JOIN tb_nfs n ON n.id = p.id_nfs
    WHERE n.numero_nfs IS NULL AND p.deleted = 0
    GROUP BY n.status, n.emissor
    ORDER BY total DESC
""")
for row in cursor.fetchall():
    print(f"    status={row['status']}, emissor={row['emissor']}: {row['total']}")

print("\n" + "=" * 70)
print("  Pagamentos sem NFS (id_nfs NULL ou 0) por empresa")
print("=" * 70)
cursor.execute("""
    SELECT p.id_empresa, COUNT(*) AS total
    FROM tb_pagamento p
    WHERE (p.id_nfs IS NULL OR p.id_nfs = 0)
      AND p.deleted = 0
    GROUP BY p.id_empresa
    ORDER BY total DESC
    LIMIT 10
""")
for row in cursor.fetchall():
    print(f"    empresa {row['id_empresa']}: {row['total']}")

cursor.close()
db.close()
print()
