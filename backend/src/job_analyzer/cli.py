"""Command-line entry point.

job-analyzer collect [--sources gupy,solides]   # extract: fetch postings, save raw snapshots
job-analyzer process                              # transform: clean, classify, extract skills
job-analyzer run [--sources ...]                  # collect + process
job-analyzer history                              # add today's dataset to the daily history
job-analyzer serve [--host H] [--port P]          # start the REST API
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Sequence

from pydantic import ValidationError

from job_analyzer.config import Settings, get_settings
from job_analyzer.exceptions import JobAnalyzerError
from job_analyzer.history import add_point, history_point
from job_analyzer.logging_config import configure_logging
from job_analyzer.models import Dataset, SourceName
from job_analyzer.pipeline import CollectionReport, collect, make_store, process

logger = logging.getLogger("job_analyzer")

EXIT_OK, EXIT_FAILURE, EXIT_CONFIG, EXIT_INTERRUPTED = 0, 1, 2, 130


def _parse_sources(value: str) -> list[SourceName]:
    try:
        return [SourceName(item.strip().lower()) for item in value.split(",") if item.strip()]
    except ValueError as exc:
        valid = ", ".join(source.value for source in SourceName)
        raise argparse.ArgumentTypeError(f"invalid source in {value!r} (valid: {valid})") from exc


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="job-analyzer", description="Empregos e Tendências - ETL e API."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    for name, help_text in (
        ("collect", "busca vagas nas fontes habilitadas e salva snapshots brutos"),
        ("run", "executa collect + process"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument(
            "--sources",
            type=_parse_sources,
            help="lista separada por vírgula (padrão: ENABLED_SOURCES)",
        )

    commands.add_parser("process", help="limpa, classifica e gera data/processed/dataset.json")
    commands.add_parser(
        "history", help="acrescenta o resumo do dataset atual em data/processed/history.json"
    )

    serve = commands.add_parser("serve", help="sobe a API REST (uvicorn)")
    serve.add_argument("--host", help="padrão: API_HOST")
    serve.add_argument("--port", type=int, help="padrão: API_PORT")
    serve.add_argument("--reload", action="store_true", help="recarrega ao editar o código (dev)")
    return parser


def _print_collection(reports: Sequence[CollectionReport]) -> None:
    print("\nColeta")
    print(f"  {'fonte':<10} {'recebidas':>9} {'válidas':>8} {'inválidas':>9} {'erros':>6}")
    for report in reports:
        print(
            f"  {report.source.value:<10} {report.received:>9} {report.valid:>8} "
            f"{report.invalid:>9} {len(report.errors):>6}"
        )


def _print_dataset(dataset: Dataset) -> None:
    stats = dataset.metadata.stats
    print("\nProcessamento")
    for label, value in (
        ("saíram do ar desde coletas anteriores", stats.delisted),
        ("registros brutos (ainda publicadas)", stats.raw_records),
        ("sem título", stats.empty_title),
        (f"mais antigas que {dataset.metadata.max_job_age_days} dias", stats.too_old),
        ("inscrições encerradas", stats.expired),
        ("duplicadas", stats.duplicates),
        ("fora do escopo (nível)", stats.out_of_scope_level),
        ("fora do escopo (área)", stats.out_of_scope_area),
        ("vagas no dataset", stats.kept),
    ):
        print(f"  {label:<38} {value:>6}")


def _serve(settings: Settings, args: argparse.Namespace) -> int:
    import uvicorn  # noqa: PLC0415 - only needed by this command

    uvicorn.run(
        "job_analyzer.api.app:create_app",
        factory=True,
        host=args.host or settings.api_host,
        port=args.port or settings.api_port,
        reload=args.reload,
        log_level=settings.log_level.lower(),
        server_header=False,
    )
    return EXIT_OK


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    try:
        settings = get_settings()
    except ValidationError as exc:
        # Report which settings are wrong without echoing their values (they may be secrets).
        print("Configuração inválida (verifique o arquivo .env):", file=sys.stderr)
        for error in exc.errors(include_input=False, include_url=False):
            field = ".".join(str(part) for part in error["loc"]).upper()
            print(f"  - {field}: {error['msg']}", file=sys.stderr)
        return EXIT_CONFIG

    configure_logging(settings.log_level)

    try:
        return _dispatch(settings, args)
    except JobAnalyzerError as exc:
        logger.error("%s", exc)
        return EXIT_FAILURE
    except KeyboardInterrupt:
        logger.warning("Interrupted.")
        return EXIT_INTERRUPTED
    except Exception:
        logger.exception("Unexpected error")
        return EXIT_FAILURE


def _dispatch(settings: Settings, args: argparse.Namespace) -> int:
    if args.command == "serve":
        return _serve(settings, args)
    if args.command == "history":
        return _record_history(settings)
    return _run_etl(settings, args)


def _run_etl(settings: Settings, args: argparse.Namespace) -> int:
    store = make_store(settings)
    if args.command in {"collect", "run"}:
        reports = collect(settings, store, sources=args.sources)
        _print_collection(reports)
        if not any(report.snapshot_saved for report in reports):
            logger.error("No source returned data.")
            return EXIT_FAILURE
        if any(report.errors for report in reports):
            logger.warning("Some requests failed; partial results were kept (see log above).")

    if args.command in {"process", "run"}:
        dataset = process(settings, store)
        _print_dataset(dataset)
        print(f"\nDataset salvo em {store.dataset_path}")
    return EXIT_OK


def _record_history(settings: Settings) -> int:
    store = make_store(settings)
    point = history_point(store.load_dataset())
    history = add_point(store.load_history(), point)
    store.save_history(history)
    first, last = history.points[0].day, history.points[-1].day
    print(f"Histórico: {len(history.points)} dia(s), de {first:%d/%m/%Y} a {last:%d/%m/%Y}")
    return EXIT_OK
