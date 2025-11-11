from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import select, desc, or_
from typing import List
from ..db import SessionLocal
from ..models import Case, User, CaseMember
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import ensure_case_access_by_id, ensure_has_write_permissions, is_admin_user
from ..auth.roles import ROLE_ADMIN, ROLE_ANALYST
from datetime import datetime
from ..services.hedgedoc import hedgedoc_manager, HedgeDocNoteMeta
from ..opensearch.client import get_opensearch_client
from ..opensearch.index_manager import create_index_if_not_exists
from ..config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class CaseIn(BaseModel):
    case_id: str
    note: str | None = None

class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    case_id: str
    status: str
    created_at_utc: datetime
    note: str | None
    hedgedoc_url: str | None = None


def serialize_case(case: Case) -> CaseOut:
    return CaseOut(
        case_id=case.case_id,
        status=case.status,
        created_at_utc=case.created_at_utc,
        note=case.note,
        hedgedoc_url=hedgedoc_manager.build_share_url(case.hedgedoc_slug),
    )


def provision_unique_note(db: Session, case_identifier: str) -> HedgeDocNoteMeta | None:
    if not hedgedoc_manager.enabled:
        return None

    note_meta: HedgeDocNoteMeta | None = None
    for _ in range(3):
        note_meta = hedgedoc_manager.provision_case_note(case_identifier)
        if not note_meta or not note_meta.slug:
            return note_meta
        existing = db.query(Case).filter(Case.hedgedoc_slug == note_meta.slug).first()
        if not existing:
            return note_meta
    return note_meta

@router.get("/cases", response_model=List[CaseOut])
def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all cases accessible to the current user.
    
    Logique d'accès :
    - Superadmin : ne voit que ses propres cases
    - Admin : voit ses propres cases + peut ajouter des analystes à ses cases
    - Analystes : voient leurs propres cases + les cases où ils sont membres (partagés par un admin)
    """
    # Utiliser select() pour une requête plus explicite et optimisée
    query = select(Case)
    
    # Tous les utilisateurs (y compris superadmin et admin) ne voient que :
    # 1. Leurs propres cases (owner_id == current_user.id)
    # 2. Les cases où ils sont membres (via CaseMember)
    
    # Récupérer les case_ids où l'utilisateur est membre
    member_case_ids_subq = select(CaseMember.case_id).where(
        CaseMember.user_id == current_user.id
    ).scalar_subquery()
    
    # Filtrer : cases possédées OU cases où l'utilisateur est membre
    query = query.where(
        or_(
            Case.owner_id == current_user.id,
            Case.case_id.in_(member_case_ids_subq)
        )
    )
    
    # Trier par date de création décroissante pour utiliser l'index
    query = query.order_by(desc(Case.created_at_utc))
    
    # Exécuter la requête et récupérer tous les résultats
    rows = db.execute(query).scalars().all()
    
    # Sérialiser en une seule passe
    return [serialize_case(row) for row in rows]

@router.post("/cases", response_model=CaseOut)
def create_case(
    payload: CaseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new case (requires authentication)."""
    ensure_has_write_permissions(current_user)
    if not is_admin_user(current_user):
        owned_count = db.query(Case).filter(Case.owner_id == current_user.id).count()
        if owned_count >= 1:
            raise HTTPException(
                status_code=403,
                detail="Standard users may only own a single case."
            )
    # Check if case_id already exists
    existing = db.query(Case).filter(Case.case_id == payload.case_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="case_id already exists")

    note_meta = provision_unique_note(db, payload.case_id)

    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
        owner_id=current_user.id,  # Associate case with current user
        hedgedoc_slug=note_meta.slug if note_meta else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    
    # Créer automatiquement l'index OpenSearch pour ce case
    try:
        client = get_opensearch_client(settings)
        created = create_index_if_not_exists(
            client=client,
            case_id=payload.case_id,
            shard_count=settings.dm_opensearch_shard_count,
            replica_count=settings.dm_opensearch_replica_count
        )
        if created:
            logger.info(f"Created OpenSearch index for new case: {payload.case_id}")
        else:
            logger.info(f"OpenSearch index already exists for case: {payload.case_id}")
    except Exception as e:
        # Ne pas faire échouer la création du case si l'index OpenSearch ne peut pas être créé
        # L'index sera créé à la volée lors de la première recherche
        logger.warning(f"Failed to create OpenSearch index for case {payload.case_id}: {e}")
    
    response = serialize_case(c)
    if response.hedgedoc_url is None and note_meta and note_meta.url:
        response.hedgedoc_url = note_meta.url
    return response


class CaseUpdate(BaseModel):
    note: str | None = None
    status: str | None = None


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a single case by ID (requires authentication and access)."""
    case = ensure_case_access_by_id(case_id, current_user, db)
    return serialize_case(case)


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a case (requires authentication and access)."""
    ensure_has_write_permissions(current_user)
    case = ensure_case_access_by_id(case_id, current_user, db)

    if payload.note is not None:
        case.note = payload.note
    if payload.status is not None:
        case.status = payload.status

    db.commit()
    db.refresh(case)
    return serialize_case(case)


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a case (requires authentication and access)."""
    ensure_has_write_permissions(current_user)
    case = ensure_case_access_by_id(case_id, current_user, db)

    db.delete(case)
    db.commit()
    return None


# -----------------
# Case Members Management (pour les admins)
# -----------------

class AddCaseMemberRequest(BaseModel):
    user_id: int


class CaseMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    case_id: str
    user_id: int
    added_at_utc: datetime
    username: str | None = None
    email: str | None = None


@router.post("/cases/{case_id}/members", response_model=CaseMemberOut)
def add_case_member(
    case_id: str,
    payload: AddCaseMemberRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Ajouter un analyste à un case (seuls les admins propriétaires peuvent le faire).
    """
    # Vérifier que l'utilisateur est admin et propriétaire du case
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if case.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the case owner can add members"
        )
    
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only admins can add members to cases"
        )
    
    # Vérifier que l'utilisateur à ajouter existe et est un analyste
    target_user = db.query(User).filter(User.id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.role != ROLE_ANALYST:
        raise HTTPException(
            status_code=400,
            detail="Only analysts can be added as case members"
        )
    
    # Vérifier si l'utilisateur n'est pas déjà membre
    existing = db.query(CaseMember).filter(
        CaseMember.case_id == case_id,
        CaseMember.user_id == payload.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member of this case")
    
    # Créer le membre
    member = CaseMember(
        case_id=case_id,
        user_id=payload.user_id
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    
    # Charger les informations de l'utilisateur pour la réponse
    return CaseMemberOut(
        id=member.id,
        case_id=member.case_id,
        user_id=member.user_id,
        added_at_utc=member.added_at_utc,
        username=target_user.username,
        email=target_user.email
    )


@router.get("/cases/{case_id}/members", response_model=List[CaseMemberOut])
def list_case_members(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lister les membres d'un case (accessible par le propriétaire et les membres).
    """
    case = ensure_case_access_by_id(case_id, current_user, db)
    
    members = db.query(CaseMember).filter(CaseMember.case_id == case_id).all()
    
    result = []
    for member in members:
        user = db.query(User).filter(User.id == member.user_id).first()
        result.append(CaseMemberOut(
            id=member.id,
            case_id=member.case_id,
            user_id=member.user_id,
            added_at_utc=member.added_at_utc,
            username=user.username if user else None,
            email=user.email if user else None
        ))
    
    return result


@router.delete("/cases/{case_id}/members/{user_id}", status_code=204)
def remove_case_member(
    case_id: str,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retirer un analyste d'un case (seuls les admins propriétaires peuvent le faire).
    """
    # Vérifier que l'utilisateur est admin et propriétaire du case
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    if case.owner_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the case owner can remove members"
        )
    
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Only admins can remove members from cases"
        )
    
    # Vérifier si le membre existe
    member = db.query(CaseMember).filter(
        CaseMember.case_id == case_id,
        CaseMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    db.delete(member)
    db.commit()
    return None
