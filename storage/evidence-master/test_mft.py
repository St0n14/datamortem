#!/usr/bin/env python3
"""
task_test_mft.py
Validation locale :
- ouvre une image disque (ex: flare.vmdk) avec Dissect
- extrait les entrées MFT via le plugin MftPlugin
- écrit un CSV test_output_mft.csv
"""

import sys
import os

from dissect.target import Target
from dissect.target.plugins.filesystem.ntfs.mft import MftPlugin


def iter_mft_records(target):
    """
    Générateur -> rend chaque entrée MFT en dict simple.
    """
    # charge explicitement le plugin MFT
    target.add_plugin(MftPlugin)

    # target.mft() renvoie un générateur d'objets
    for rec in target.mft():
        yield {
            "path": str(getattr(rec, "path", "")),
            "ts": getattr(rec, "ts", None),
            "macb": getattr(rec, "macb", None),
            "inuse": getattr(rec, "inuse", None),
            "resident": getattr(rec, "resident", None),
            "size": getattr(rec, "size", None),
            "owner": getattr(rec, "owner", None),
            "ads": getattr(rec, "ads", None),
        }


def main():
    if len(sys.argv) < 2:
        print("Usage: python task_test_mft.py /path/to/disk_image.vmdk")
        sys.exit(1)

    disk_path = sys.argv[1]

    if not os.path.exists(disk_path):
        print(f"[ERR] disk path not found: {disk_path}")
        sys.exit(1)

    out_path = "./test_output_mft.csv"

    print(f"[+] Ouverture du disque avec Dissect: {disk_path}")
    target = Target.open(disk_path)

    try:
        print("[+] Extraction des entrées MFT ...")
        rows = list(iter_mft_records(target))
        print(f"[+] {len(rows)} entrées MFT récupérées")

        print(f"[+] Écriture CSV -> {out_path}")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write("path,ts,macb,inuse,resident,size,owner,ads\n")
            for r in rows:
                path = (r["path"] or "").replace(",", "\\,")
                ts = r["ts"] or ""
                macb = r["macb"] or ""
                inuse = r["inuse"] if r["inuse"] is not None else ""
                resident = r["resident"] if r["resident"] is not None else ""
                size = r["size"] if r["size"] is not None else ""
                owner = r["owner"] or ""
                ads = r["ads"] if r["ads"] is not None else ""

                f.write(f"{path},{ts},{macb},{inuse},{resident},{size},{owner},{ads}\n")

        print("[✓] Done.")
        print(f"[i] Résultat écrit dans {out_path}")

    finally:
        # Certaines versions de Dissect exposent target.close()
        # On l'appelle si dispo pour être propre.
        if hasattr(target, "close"):
            target.close()


if __name__ == "__main__":
    main()
