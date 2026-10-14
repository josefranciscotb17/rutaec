# 🚌 RutaEC

![CI](https://github.com/josefranciscotb17/rutaec/actions/workflows/ci.yml/badge.svg)
![Licencia](https://img.shields.io/badge/licencia-MIT-green)
![Versión](https://img.shields.io/badge/versi%C3%B3n-0.1.0-blue)

**RutaEC** es una aplicación web para la gestión y venta de pasajes de transporte interprovincial en Ecuador. Permite a las cooperativas administrar buses, frecuencias y hojas de ruta, a los oficinistas vender boletos y a los clientes comprar en línea y viajar con un código QR en el celular.

Proyecto del segundo parcial de **Manejo y Configuración de Software** — Carrera de Software, Facultad de Ingeniería en Sistemas, Electrónica e Industrial, Universidad Técnica de Ambato.

## Requisitos

- [Node.js](https://nodejs.org/) **22.13 o superior** (incluye SQLite, no hay que instalar una base de datos)
- [Git](https://git-scm.com/)

## Instalación

```bash
git clone https://github.com/josefranciscotb17/rutaec.git
cd rutaec
git switch develop
npm install
npm start        # http://localhost:3000
```

## Flujo de trabajo (Gitflow)

| Rama | Propósito |
|---|---|
| `main` | Versiones estables y etiquetadas (`v0.5.0`) |
| `develop` | Integración del trabajo del equipo |
| `feature/HU-n-descripcion` | Una historia de usuario por rama; se fusiona a `develop` con Pull Request |
| `release/x.y.z` | Congela y prueba una versión antes de publicarla |
| `hotfix/HU-n-descripcion` | Corrección urgente sobre `main` |

Cada cambio nace de un *issue* (historia de usuario `HU-n`) del tablero del proyecto en GitHub. Consulta [`CONTRIBUTING.md`](CONTRIBUTING.md) cuando esté disponible en la rama `develop`.

## Equipo

| Integrante | Responsabilidad |
|---|---|
| José Francisco Taipe Bravo | Líder técnico, dueño del repositorio y Release Manager |
| Diana Pamela Tituaña Calapiña | Gobernanza, autenticación, aplicación del chofer, administración y automatización (CI) |
| Paola Alexandra Taipe Tixilema | Documentación técnica, ventas, boletos y ventanilla del oficinista |
| Michael Steve Rosillo Córdova | Base de datos, rotación de buses y módulo de la cooperativa (API y panel) |
| Britthany Korayma Pico Coello | Front-end: interfaz, búsqueda, compra y cuenta del usuario; hotfix |

## Cómo citar

GitHub muestra el botón **Cite this repository** gracias al archivo [`CITATION.cff`](CITATION.cff).

## Licencia

Distribuido bajo la licencia [MIT](LICENSE).
