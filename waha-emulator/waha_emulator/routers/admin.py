"""ノードと線で組んだワークフローの管理用 API。

検証用の道具のため、認証は持たない。`WAHA_STUDIO_DIR` を設定したときだけ載せる。
servicerun API（server-local が呼ぶ経路）とは別のパスに置く。
"""

from http import HTTPStatus
from typing import Annotated, Any

from fastapi import APIRouter, Body, HTTPException, Request, Response

from waha_emulator.studio.graph import GraphError
from waha_emulator.studio.service import (
    StudioConflictError,
    StudioNotFoundError,
    StudioService,
)

ADMIN_PATH = "/admin/workflows"
NOT_FOUND_MESSAGE = "ワークフローがありません"

router = APIRouter(prefix=ADMIN_PATH)

# 定義の形の検証は parse_graph に任せるため、本文は何でも受け取る
DefinitionBody = Annotated[Any, Body()]


def _service(request: Request) -> StudioService:
    """アプリの状態から、ワークフローの管理を取り出す。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。

    Returns
    -------
    StudioService
        ワークフローの管理。
    """
    service: StudioService = request.app.state.studio
    return service


def _bad_request(error: GraphError) -> HTTPException:
    """定義の不正を 400 にする。

    Parameters
    ----------
    error : GraphError
        定義の不正。

    Returns
    -------
    HTTPException
        400 の例外。
    """
    return HTTPException(HTTPStatus.BAD_REQUEST, str(error))


def _conflict(error: StudioConflictError) -> HTTPException:
    """id・サービス ID の重なりを 409 にする。

    Parameters
    ----------
    error : StudioConflictError
        重なりのエラー。

    Returns
    -------
    HTTPException
        409 の例外。
    """
    return HTTPException(HTTPStatus.CONFLICT, str(error))


def _not_found() -> HTTPException:
    """ワークフローがないことを 404 にする。

    Returns
    -------
    HTTPException
        404 の例外。
    """
    return HTTPException(HTTPStatus.NOT_FOUND, NOT_FOUND_MESSAGE)


@router.get("")
def list_workflows(request: Request) -> list[dict[str, Any]]:
    """ワークフローの一覧を返す。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。

    Returns
    -------
    list[dict[str, Any]]
        ID・名前・サービス ID。
    """
    return _service(request).list_workflows()


@router.post("", status_code=HTTPStatus.CREATED)
def create_workflow(request: Request, body: DefinitionBody) -> dict[str, Any]:
    """ワークフローを作る。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。
    body : Any
        定義。

    Returns
    -------
    dict[str, Any]
        作った定義（秘密情報を伏せたもの）。

    Raises
    ------
    HTTPException
        定義が不正（400）、id・サービス ID が重なる（409）とき。
    """
    try:
        return _service(request).create(body)
    except GraphError as e:
        raise _bad_request(e) from e
    except StudioConflictError as e:
        raise _conflict(e) from e


@router.post("/validate")
def validate_workflow(request: Request, body: DefinitionBody) -> dict[str, bool]:
    """保存せずに、定義が正しいかを確かめる。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。
    body : Any
        定義。

    Returns
    -------
    dict[str, bool]
        正しければ `{"ok": true}`。

    Raises
    ------
    HTTPException
        定義が不正（400）、サービス ID が重なる（409）とき。
    """
    try:
        _service(request).validate(body)
    except GraphError as e:
        raise _bad_request(e) from e
    except StudioConflictError as e:
        raise _conflict(e) from e
    return {"ok": True}


@router.get("/{graph_id}")
def get_workflow(request: Request, graph_id: str) -> dict[str, Any]:
    """ワークフローの定義を返す。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。
    graph_id : str
        ワークフローの ID。

    Returns
    -------
    dict[str, Any]
        定義（秘密情報を伏せたもの）。

    Raises
    ------
    HTTPException
        ワークフローがないとき（404）。
    """
    try:
        return _service(request).get(graph_id)
    except StudioNotFoundError as e:
        raise _not_found() from e


@router.put("/{graph_id}")
def update_workflow(
    request: Request, graph_id: str, body: DefinitionBody
) -> dict[str, Any]:
    """ワークフローを更新する。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。
    graph_id : str
        ワークフローの ID。
    body : Any
        定義。

    Returns
    -------
    dict[str, Any]
        更新した定義（秘密情報を伏せたもの）。

    Raises
    ------
    HTTPException
        ワークフローがない（404）、定義が不正（400）、サービス ID が重なる（409）とき。
    """
    try:
        return _service(request).update(graph_id, body)
    except StudioNotFoundError as e:
        raise _not_found() from e
    except GraphError as e:
        raise _bad_request(e) from e
    except StudioConflictError as e:
        raise _conflict(e) from e


@router.delete("/{graph_id}", status_code=HTTPStatus.NO_CONTENT)
def delete_workflow(request: Request, graph_id: str) -> Response:
    """ワークフローを消す。

    Parameters
    ----------
    request : Request
        FastAPI のリクエスト。
    graph_id : str
        ワークフローの ID。

    Returns
    -------
    Response
        本文のない 204。

    Raises
    ------
    HTTPException
        ワークフローがないとき（404）。
    """
    try:
        _service(request).delete(graph_id)
    except StudioNotFoundError as e:
        raise _not_found() from e
    return Response(status_code=HTTPStatus.NO_CONTENT)
