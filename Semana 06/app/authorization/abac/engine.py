"""Motor de políticas ABAC (Policy Decision Point).

Lee las políticas activas de la BD, decide cuáles aplican a la petición según sus
parámetros y evalúa todas. Basta con que una falle para denegar.
"""
import json
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.authorization.abac.context import ContextoAutorizacion
from app.authorization.abac.policies import REGISTRO
from app.models import Politica


@dataclass
class ResultadoABAC:
    permitido: bool
    evaluadas: list[str] = field(default_factory=list)
    motivos: list[str] = field(default_factory=list)


class ABACEngine:
    def __init__(self, db: Session):
        self.db = db

    def politicas_activas(self) -> list[Politica]:
        return list(
            self.db.scalars(select(Politica).where(Politica.activa.is_(True)).order_by(Politica.orden))
        )

    @staticmethod
    def aplica(params: dict, ctx: ContextoAutorizacion) -> bool:
        """¿Esta política corresponde a esta petición? Se decide solo con parámetros."""
        acciones = params.get("acciones", ["*"])
        if "*" not in acciones and ctx.accion not in acciones:
            return False
        if params.get("requiere_recurso", True) and ctx.recurso is None:
            return False
        roles = params.get("roles")
        if roles and ctx.usuario["rol"] not in roles:
            return False
        if ctx.usuario["rol"] in params.get("roles_exentos", []):
            return False
        return True

    def evaluar(self, ctx: ContextoAutorizacion) -> ResultadoABAC:
        resultado = ResultadoABAC(permitido=True)
        for pol in self.politicas_activas():
            params = json.loads(pol.parametros or "{}")
            if not self.aplica(params, ctx):
                continue
            evaluador = REGISTRO.get(pol.codigo)
            if evaluador is None:
                # Si hay una política en la BD sin implementación, se deniega (fail closed).
                resultado.permitido = False
                resultado.motivos.append(f"Política {pol.codigo} sin implementación")
                continue
            resultado.evaluadas.append(pol.codigo)
            cumple, motivo = evaluador(ctx, params)
            if not cumple:
                resultado.permitido = False
                resultado.motivos.append(f"[{pol.codigo}] {motivo}")
        return resultado
