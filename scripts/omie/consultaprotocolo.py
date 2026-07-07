import requests
from bs4 import BeautifulSoup

def consultar_protocolo(tipo, numero, ano):
    print(f"Iniciando consulta do protocolo {tipo}-{numero}/{ano}...")
    
    # Formata o tipo para remover o zero à esquerda (ex: '01' vira '1')
    tipo_formatado = str(int(tipo)) 
    
    url = f"http://consultaprotocolo.curitiba.pr.gov.br/frmConsProtocolo.aspx?txtNumProtocolo={numero}&txtAnoProtocolo={ano}&txtTipoProtocolo={tipo_formatado}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status() 
        
        soup_resultado = BeautifulSoup(response.text, 'html.parser')
        
        # --- NOVA EXTRAÇÃO: SITUAÇÃO GERAL ---
        tag_situacao = soup_resultado.find('span', id='lblSituacao')
        situacao = tag_situacao.text.strip() if tag_situacao else "Não informada"
        
        # --- EXTRAÇÃO DO ÚLTIMO TRÂMITE ---
        linhas_valor = soup_resultado.find_all('tr', class_='TramiteValor')
        linhas_parecer = soup_resultado.find_all('tr', class_='TramiteParecer')
        
        if linhas_valor and linhas_parecer:
            ultimo_tramite_valor = linhas_valor[0]
            ultimo_tramite_parecer = linhas_parecer[0]
            
            spans_valores = ultimo_tramite_valor.find_all('span', class_='valor')
            
            data = spans_valores[0].text.strip() if len(spans_valores) > 0 else "N/A"
            da_unidade = spans_valores[1].text.strip() if len(spans_valores) > 1 else "N/A"
            para_unidade = spans_valores[3].text.strip() if len(spans_valores) > 3 else "N/A"
            
            parecer_bruto = ultimo_tramite_parecer.text.replace('Parecer do Protocolo:', '').strip()
            parecer_limpo = " ".join(parecer_bruto.split())
            
            return {
                "sucesso": True,
                "situacao": situacao, # <-- Campo adicionado ao retorno
                "data": data,
                "origem": da_unidade,
                "destino": para_unidade,
                "parecer": parecer_limpo
            }
        else:
            return {
                "sucesso": False, 
                "erro": "A página abriu, mas os trâmites não foram encontrados. O número do protocolo pode estar incorreto."
            }
            
    except Exception as e:
        return {
            "sucesso": False,
            "erro": f"Erro de conexão: {str(e)}"
        }

if __name__ == "__main__":
    resultado = consultar_protocolo('01', '134763', '2026')
    
    print("\n--- RESULTADO DA AUTOMAÇÃO ---")
    if resultado["sucesso"]:
        print(f"📌 Situação Geral: {resultado['situacao']}")
        print(f"📅 Data da Última Movimentação: {resultado['data']}")
        print(f"🏢 De (Origem): {resultado['origem']}")
        print(f"🏢 Para (Destino): {resultado['destino']}")
        print(f"📝 Parecer/Status: {resultado['parecer']}")
    else:
        print(f"❌ Falha: {resultado['erro']}")