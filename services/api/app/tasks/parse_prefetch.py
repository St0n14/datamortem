from dissect.target import Target

# Initialisation du Target sur une image disque
t = Target.open("/chemin/vers/image.img")

# Exemples d'accès
print("Hostname détecté :", t.hostname)
print("Version OS :", t.version)

# Pour parser des artefacts, on peut ensuite utiliser les plugins, ex:
prefetch_records = t.prefetch.records()
print("Nb de Prefetch trouvés :", len(prefetch_records))
