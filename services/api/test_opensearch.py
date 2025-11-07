#!/usr/bin/env python3
"""
Script de test pour le module OpenSearch de dataMortem.

Usage:
    python test_opensearch.py
"""

import sys
import os
from pathlib import Path

# Ajoute le répertoire parent au path
sys.path.insert(0, str(Path(__file__).parent))

from app.config import settings
from app.opensearch.client import get_opensearch_client, test_connection
from app.opensearch.index_manager import (
    create_index_if_not_exists,
    get_index_name,
    get_document_count,
    delete_case_index
)
from app.opensearch.indexer import index_csv_results
from app.opensearch.search import search_events, aggregate_field
import pandas as pd
from datetime import datetime


def test_1_connection():
    """Test 1: Connexion OpenSearch"""
    print("\n" + "="*60)
    print("TEST 1: Connexion OpenSearch")
    print("="*60)

    try:
        client = get_opensearch_client(settings)
        info = test_connection(client)
        print(f"✅ Connexion OK")
        print(f"   Version: {info['version']['number']}")
        print(f"   Cluster: {info['cluster_name']}")
        return True
    except Exception as e:
        print(f"❌ Connexion échouée: {e}")
        return False


def test_2_create_index():
    """Test 2: Création d'index"""
    print("\n" + "="*60)
    print("TEST 2: Création d'index")
    print("="*60)

    try:
        client = get_opensearch_client(settings)
        case_id = "test_case_001"

        # Supprime l'index s'il existe
        try:
            delete_case_index(client, case_id)
            print(f"   Index existant supprimé")
        except:
            pass

        # Crée l'index
        created = create_index_if_not_exists(client, case_id)
        index_name = get_index_name(case_id)

        if created:
            print(f"✅ Index créé: {index_name}")
        else:
            print(f"⚠️  Index existe déjà: {index_name}")

        # Vérifie que l'index existe
        exists = client.indices.exists(index=index_name)
        print(f"   Vérification existence: {exists}")

        return exists
    except Exception as e:
        print(f"❌ Création index échouée: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_3_create_sample_data():
    """Test 3: Créer des données de test CSV"""
    print("\n" + "="*60)
    print("TEST 3: Création de données de test")
    print("="*60)

    try:
        # Crée un répertoire temporaire
        test_dir = Path("/tmp/datamortem_test")
        test_dir.mkdir(exist_ok=True)

        csv_path = test_dir / "test_events.csv"

        # Crée des données de test (événements forensiques simulés)
        data = {
            "@timestamp": [
                "2024-11-06T10:00:00Z",
                "2024-11-06T10:05:00Z",
                "2024-11-06T10:10:00Z",
                "2024-11-06T10:15:00Z",
                "2024-11-06T10:20:00Z",
            ],
            "event.type": ["process", "file", "network", "registry", "process"],
            "event.action": ["created", "modified", "connection", "modified", "terminated"],
            "message": [
                "Process svchost.exe started",
                "File C:\\Windows\\System32\\cmd.exe modified",
                "Network connection to 192.168.1.100:443",
                "Registry key HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run modified",
                "Process powershell.exe terminated"
            ],
            "process.name": ["svchost.exe", None, None, None, "powershell.exe"],
            "process.pid": [1234, None, None, None, 5678],
            "file.path": [None, "C:\\Windows\\System32\\cmd.exe", None, None, None],
            "file.name": [None, "cmd.exe", None, None, None],
            "source_ip": [None, None, "192.168.1.50", None, None],
            "destination_ip": [None, None, "192.168.1.100", None, None],
            "destination_port": [None, None, 443, None, None],
            "registry.key": [None, None, None, "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", None],
            "user.name": ["SYSTEM", "Administrator", "jdoe", "Administrator", "jdoe"],
        }

        df = pd.DataFrame(data)
        df.to_csv(csv_path, index=False)

        print(f"✅ Données de test créées: {csv_path}")
        print(f"   Nombre d'événements: {len(df)}")
        print(f"   Aperçu:")
        print(df[["@timestamp", "event.type", "message"]].to_string(index=False))

        return str(csv_path)
    except Exception as e:
        print(f"❌ Création données échouée: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_4_index_data(csv_path):
    """Test 4: Indexation des données"""
    print("\n" + "="*60)
    print("TEST 4: Indexation des données")
    print("="*60)

    if not csv_path:
        print("❌ Pas de données à indexer")
        return False

    try:
        client = get_opensearch_client(settings)
        case_id = "test_case_001"
        evidence_uid = "test_evidence_001"
        parser_name = "test_parser"

        stats = index_csv_results(
            client=client,
            case_id=case_id,
            evidence_uid=evidence_uid,
            parser_name=parser_name,
            csv_path=csv_path,
            batch_size=100,
            case_name="Test Case"
        )

        print(f"✅ Indexation terminée")
        print(f"   Total lignes: {stats['total_rows']}")
        print(f"   Indexés: {stats['indexed']}")
        print(f"   Échoués: {stats['failed']}")

        if stats['errors']:
            print(f"   Erreurs: {stats['errors'][:3]}")

        # Attend que les documents soient visibles (refresh)
        import time
        time.sleep(2)

        # Vérifie le count
        count = get_document_count(client, case_id)
        print(f"   Documents dans l'index: {count}")

        return stats['indexed'] > 0
    except Exception as e:
        print(f"❌ Indexation échouée: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_5_search():
    """Test 5: Recherche simple"""
    print("\n" + "="*60)
    print("TEST 5: Recherche simple")
    print("="*60)

    try:
        client = get_opensearch_client(settings)
        case_id = "test_case_001"
        index_name = get_index_name(case_id)

        # Recherche: "svchost.exe"
        print("\n   Recherche: 'svchost.exe'")
        response = search_events(
            client=client,
            index_name=index_name,
            query="svchost.exe",
            from_=0,
            size=10
        )

        print(f"   ✅ Trouvé {response['hits']['total']['value']} résultats")
        print(f"   Temps: {response['took']}ms")

        for i, hit in enumerate(response['hits']['hits'][:3], 1):
            source = hit['_source']
            print(f"\n   Résultat {i}:")
            print(f"      Timestamp: {source.get('@timestamp')}")
            print(f"      Type: {source.get('event', {}).get('type')}")
            print(f"      Message: {source.get('message')}")

        # Recherche: "file"
        print("\n   Recherche: événements de type 'file'")
        response = search_events(
            client=client,
            index_name=index_name,
            query="*",
            filters={"event.type": "file"},
            from_=0,
            size=10
        )

        print(f"   ✅ Trouvé {response['hits']['total']['value']} résultats")

        return True
    except Exception as e:
        print(f"❌ Recherche échouée: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_6_aggregations():
    """Test 6: Agrégations"""
    print("\n" + "="*60)
    print("TEST 6: Agrégations")
    print("="*60)

    try:
        client = get_opensearch_client(settings)
        case_id = "test_case_001"
        index_name = get_index_name(case_id)

        # Agrégation sur event.type
        print("\n   Agrégation: Types d'événements")
        agg_result = aggregate_field(
            client=client,
            index_name=index_name,
            field="event.type",
            size=10
        )

        print(f"   ✅ Top event types:")
        for bucket in agg_result['buckets']:
            print(f"      {bucket['key']}: {bucket['doc_count']} événements")

        # Agrégation sur user.name
        print("\n   Agrégation: Utilisateurs")
        agg_result = aggregate_field(
            client=client,
            index_name=index_name,
            field="user.name",
            size=10
        )

        print(f"   ✅ Top utilisateurs:")
        for bucket in agg_result['buckets']:
            print(f"      {bucket['key']}: {bucket['doc_count']} événements")

        return True
    except Exception as e:
        print(f"❌ Agrégations échouées: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_7_cleanup():
    """Test 7: Nettoyage"""
    print("\n" + "="*60)
    print("TEST 7: Nettoyage")
    print("="*60)

    try:
        client = get_opensearch_client(settings)
        case_id = "test_case_001"

        # Supprime l'index de test
        deleted = delete_case_index(client, case_id)

        if deleted:
            print(f"✅ Index de test supprimé")
        else:
            print(f"⚠️  Index déjà absent")

        return True
    except Exception as e:
        print(f"❌ Nettoyage échoué: {e}")
        return False


def main():
    """Exécute tous les tests"""
    print("\n")
    print("🔬 " + "="*58)
    print("🔬 TESTS MODULE OPENSEARCH - dataMortem")
    print("🔬 " + "="*58)

    results = {}

    # Test 1: Connexion
    results['connection'] = test_1_connection()
    if not results['connection']:
        print("\n❌ ARRÊT: OpenSearch n'est pas accessible")
        print("   Vérifiez que OpenSearch est démarré avec:")
        print("   docker-compose -f docker-compose.opensearch.yml up -d")
        return

    # Test 2: Création d'index
    results['create_index'] = test_2_create_index()

    # Test 3: Création de données
    csv_path = test_3_create_sample_data()
    results['create_data'] = csv_path is not None

    # Test 4: Indexation
    results['indexing'] = test_4_index_data(csv_path)

    # Test 5: Recherche
    results['search'] = test_5_search()

    # Test 6: Agrégations
    results['aggregations'] = test_6_aggregations()

    # Test 7: Nettoyage
    results['cleanup'] = test_7_cleanup()

    # Résumé
    print("\n" + "="*60)
    print("📊 RÉSUMÉ DES TESTS")
    print("="*60)

    for test_name, result in results.items():
        status = "✅" if result else "❌"
        print(f"{status} {test_name}")

    total = len(results)
    passed = sum(results.values())
    print(f"\n{passed}/{total} tests réussis")

    if passed == total:
        print("\n🎉 TOUS LES TESTS PASSENT!")
    else:
        print(f"\n⚠️  {total - passed} test(s) échoué(s)")


if __name__ == "__main__":
    main()
