<div align="center">
    <img width="64" alt="drawDB logo" src="drawdb-logo.png">
    <h1>drawDB (personal fork)</h1>
</div>

<p align="center">
    <a href="#en">English</a> · <a href="#es">Español</a> · <a href="#zh">中文</a>
</p>

<h3 align="center"><img width="700" style="border-radius:5px;" alt="drawDB screenshot" src="drawdb.png"></h3>

<a id="en"></a>

## English

This is a personal fork of **[drawDB](https://github.com/drawdb-io/drawdb)**, the free and open source database diagram editor and SQL generator. I adapted it to my own workflow, so it changes things the way I need them and may not suit anyone else. It is not affiliated with or endorsed by the drawDB project, and it is not meant to replace it.

### Please support the original project

All the credit for drawDB goes to its authors and contributors. If you find it useful, support them rather than this fork:

- ⭐ Star [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb) on GitHub.
- 💖 Sponsor its author on [GitHub Sponsors](https://github.com/sponsors/1ilit).
- ✏️ Use the official app at [drawdb.app](https://drawdb.app/).
- 💬 Join the community on [Discord](https://discord.gg/BrjZgNrmR6).
- 🐛 Report bugs and contribute to [the original repository](https://github.com/drawdb-io/drawdb/issues). Only report problems here if they come from the changes in this fork.

### What this fork changes

- A Python (FastAPI) backend stores diagrams, shared links and version history in SQLite, instead of the browser and GitHub Gists.
- The home page is a hub of diagrams grouped into workspaces, with optional passwords that can be turned off.
- Relationship lines are routed around tables and can be reshaped by dragging their segments, as in draw.io.
- Diagrams can also be exported as SQLAlchemy and Entity Framework Core models.
- The interface is in English, Spanish and Chinese only.
- The code is split into [`frontend/`](frontend/README.md) and [`backend/`](backend/README.md), and uses pnpm.

### Running it

The editor needs the backend running to save diagrams. Start the backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app        # http://127.0.0.1:5000
```

Then, in another terminal, the frontend:

```bash
cd frontend
pnpm install
pnpm dev                       # http://localhost:5173
```

The [frontend](frontend/README.md) and [backend](backend/README.md) READMEs explain configuration and how each part works.

### License

Like the original, this fork is licensed under the [GNU AGPL-3.0](LICENSE).

<a id="es"></a>

## Español

Este es un fork personal de **[drawDB](https://github.com/drawdb-io/drawdb)**, el editor gratuito y de código abierto de diagramas de bases de datos y generador de SQL. Lo adapté a mi propio flujo de trabajo, así que cambia las cosas a mi manera y puede no servirle a nadie más. No está afiliado al proyecto drawDB ni respaldado por él, y no pretende reemplazarlo.

### Por favor, apoya al proyecto original

Todo el mérito de drawDB es de sus autores y colaboradores. Si te resulta útil, apóyalos a ellos en lugar de a este fork:

- ⭐ Dale una estrella a [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb) en GitHub.
- 💖 Patrocina a su autor en [GitHub Sponsors](https://github.com/sponsors/1ilit).
- ✏️ Usa la aplicación oficial en [drawdb.app](https://drawdb.app/).
- 💬 Únete a la comunidad en [Discord](https://discord.gg/BrjZgNrmR6).
- 🐛 Reporta errores y contribuye en [el repositorio original](https://github.com/drawdb-io/drawdb/issues). Reporta aquí solo los problemas causados por los cambios de este fork.

### Qué cambia este fork

- Un backend en Python (FastAPI) guarda los diagramas, los enlaces compartidos y el historial de versiones en SQLite, en lugar de en el navegador y en GitHub Gists.
- La página de inicio es un panel de diagramas agrupados en espacios de trabajo, con contraseñas opcionales que se pueden desactivar.
- Las líneas de las relaciones esquivan las tablas y se pueden modificar arrastrando sus tramos, como en draw.io.
- Los diagramas también se pueden exportar como modelos de SQLAlchemy y de Entity Framework Core.
- La interfaz está solo en inglés, español y chino.
- El código está separado en [`frontend/`](frontend/README.md) y [`backend/`](backend/README.md), y usa pnpm.

### Cómo ejecutarlo

El editor necesita el backend en marcha para guardar los diagramas. Arranca el backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app        # http://127.0.0.1:5000
```

Después, en otra terminal, el frontend:

```bash
cd frontend
pnpm install
pnpm dev                       # http://localhost:5173
```

Los README del [frontend](frontend/README.md) y del [backend](backend/README.md) (en inglés) explican la configuración y cómo funciona cada parte.

### Licencia

Igual que el original, este fork está bajo la licencia [GNU AGPL-3.0](LICENSE).

<a id="zh"></a>

## 中文

这是 **[drawDB](https://github.com/drawdb-io/drawdb)** 的个人分支。drawDB 是一款免费、开源的数据库关系图编辑器和 SQL 生成器。我根据自己的工作流程对它进行了修改，因此这些改动只符合我自己的需要，未必适合其他人。本分支与 drawDB 项目没有任何关联，也未获得其认可，无意取代原项目。

### 请支持原项目

drawDB 的全部功劳属于它的作者和贡献者。如果你觉得它有用，请支持原项目，而不是这个分支：

- ⭐ 在 GitHub 上为 [drawdb-io/drawdb](https://github.com/drawdb-io/drawdb) 点星。
- 💖 通过 [GitHub Sponsors](https://github.com/sponsors/1ilit) 赞助原作者。
- ✏️ 使用官方应用 [drawdb.app](https://drawdb.app/)。
- 💬 加入 [Discord](https://discord.gg/BrjZgNrmR6) 社区。
- 🐛 请到[原仓库](https://github.com/drawdb-io/drawdb/issues)报告问题和参与贡献。只有由本分支改动引起的问题才在这里报告。

### 本分支的改动

- 使用 Python（FastAPI）后端，将图表、分享链接和版本历史保存在 SQLite 中，而不是保存在浏览器和 GitHub Gists 中。
- 首页是按工作区分组的图表列表，工作区可以设置密码，此功能也可以关闭。
- 关系连线会绕开数据表，并且可以像 draw.io 一样拖动线段来调整。
- 图表还可以导出为 SQLAlchemy 和 Entity Framework Core 模型。
- 界面只保留英文、西班牙文和中文。
- 代码分为 [`frontend/`](frontend/README.md) 和 [`backend/`](backend/README.md) 两部分，并使用 pnpm。

### 运行方法

编辑器需要后端运行才能保存图表。先启动后端：

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app        # http://127.0.0.1:5000
```

然后在另一个终端中启动前端：

```bash
cd frontend
pnpm install
pnpm dev                       # http://localhost:5173
```

[前端](frontend/README.md)和[后端](backend/README.md)的 README（英文）介绍了配置方法和各部分的工作原理。

### 许可证

与原项目一样，本分支采用 [GNU AGPL-3.0](LICENSE) 许可证。
