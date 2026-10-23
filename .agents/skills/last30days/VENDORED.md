# last30days — skill vendorizada

Cópia da skill `last30days` **v3.6.0** (autor: mvanhorn, licença MIT) embarcada neste repo para que as routines `/schedule` na nuvem tenham acesso a ela — o runtime headless não traz plugins instalados localmente.

- **Fonte:** https://github.com/mvanhorn/last30days-skill
- **O que foi incluído:** `SKILL.md`, `scripts/` (engine Python, só stdlib — sem `pip install`), `references/`, `agents/`.
- **O que foi removido:** `assets/` (14MB de mídia de demo, desnecessária para a função).
- **Funciona keyless:** Reddit, Hacker News, Polymarket, GitHub (sem chaves). Fontes extras (X/YouTube/TikTok) precisam de chaves opcionais (`OPENAI_API_KEY`, `XAI_API_KEY`, `SCRAPECREATORS_API_KEY`, etc.) — não configuradas.
- **Uso headless (routines):** `python3 .claude/skills/last30days/scripts/last30days.py "<topico>" --quick --emit json --search reddit,hackernews,polymarket,github --days 30`. O caminho determinístico é o oficial para cron/headless (a própria engine avisa isso).

Para atualizar a versão: rebaixar do upstream e re-copiar (sem `assets/`, sem `__pycache__`).
