"""
OpenSearch index mappings for Requiem.

Provides ECS-inspired mapping with forensic-specific fields and dynamic templates.
"""


def get_base_mapping(
    shard_count: int = 1,
    replica_count: int = 0
) -> dict:
    """
    Retourne le mapping hybride pour un index Requiem.

    Stratégie:
    - Champs communs ECS-inspired: mapping strict
    - Champs spécifiques parsers: dynamic templates

    Args:
        shard_count: Number of primary shards (default: 1 for dev)
        replica_count: Number of replicas (default: 0 for dev)

    Returns:
        Complete index configuration with settings and mappings
    """
    return {
        "settings": {
            "number_of_shards": shard_count,
            "number_of_replicas": replica_count,
            "index": {
                "refresh_interval": "5s",           # Balance perf vs near-real-time
                "max_result_window": 100000,        # Limite pagination profonde
            }
        },
        "mappings": {
            "properties": {
                # === TIMESTAMP (obligatoire) ===
                "@timestamp": {
                    "type": "date",
                    "format": "strict_date_optional_time||epoch_millis"
                },

                # === CASE CONTEXT (strict) ===
                "case": {
                    "properties": {
                        "id": {"type": "keyword"},
                        "name": {"type": "keyword"}
                    }
                },

                # === EVIDENCE/HOST CONTEXT (strict) ===
                "evidence": {
                    "properties": {
                        "uid": {"type": "keyword"}
                    }
                },
                "host": {
                    "properties": {
                        "id": {"type": "keyword"},
                        "name": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword"}
                            }
                        }
                    }
                },

                # === SOURCE/PARSER INFO (strict) ===
                "source": {
                    "properties": {
                        "parser": {"type": "keyword"},        # ex: "parse_mft"
                        "version": {"type": "keyword"}        # version du parser
                    }
                },

                # === EVENT CLASSIFICATION (ECS-inspired) ===
                "event": {
                    "properties": {
                        "type": {"type": "keyword"},          # process, file, network, registry...
                        "category": {"type": "keyword"},      # authentication, file, network...
                        "action": {"type": "keyword"},        # created, modified, deleted...
                        "outcome": {"type": "keyword"}        # success, failure, unknown
                    }
                },

                # === COMMON FORENSIC FIELDS ===
                "message": {
                    "type": "text",
                    "fields": {
                        "keyword": {"type": "keyword", "ignore_above": 512}
                    }
                },

                "file": {
                    "properties": {
                        "path": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword", "ignore_above": 1024}
                            }
                        },
                        "name": {"type": "keyword"},
                        "extension": {"type": "keyword"},
                        "size": {"type": "long"},
                        "hash": {
                            "properties": {
                                "md5": {"type": "keyword"},
                                "sha1": {"type": "keyword"},
                                "sha256": {"type": "keyword"}
                            }
                        }
                    }
                },

                "process": {
                    "properties": {
                        "name": {"type": "keyword"},
                        "pid": {"type": "long"},
                        "command_line": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword", "ignore_above": 2048}
                            }
                        },
                        "parent": {
                            "properties": {
                                "pid": {"type": "long"},
                                "name": {"type": "keyword"}
                            }
                        }
                    }
                },

                "user": {
                    "properties": {
                        "name": {"type": "keyword"},
                        "id": {"type": "keyword"},
                        "domain": {"type": "keyword"}
                    }
                },

                "registry": {
                    "properties": {
                        "key": {
                            "type": "text",
                            "fields": {
                                "keyword": {"type": "keyword", "ignore_above": 1024}
                            }
                        },
                        "value": {"type": "keyword"},
                        "data": {"type": "text"}
                    }
                },

                # === NETWORK (optionnel) ===
                "network": {
                    "properties": {
                        "protocol": {"type": "keyword"},
                        "direction": {"type": "keyword"}      # inbound, outbound
                    }
                },

                "source_ip": {"type": "ip"},
                "destination_ip": {"type": "ip"},
                "source_port": {"type": "integer"},
                "destination_port": {"type": "integer"},

                # === TAGS & ANNOTATIONS ===
                "tags": {"type": "keyword"},                  # Liste de tags
                "score": {"type": "integer"},                 # Score de suspicion (0-100)

                # === METADATA ===
                "indexed_at": {
                    "type": "date",
                    "format": "strict_date_optional_time||epoch_millis"
                }
            },

            # === DYNAMIC TEMPLATES (pour champs non-standards) ===
            "dynamic_templates": [
                {
                    "strings_as_keywords": {
                        "match_mapping_type": "string",
                        "match": "*_id",                      # Tous les champs terminant par _id
                        "mapping": {"type": "keyword"}
                    }
                },
                {
                    "strings_as_text": {
                        "match_mapping_type": "string",
                        "mapping": {
                            "type": "text",
                            "fields": {
                                "keyword": {
                                    "type": "keyword",
                                    "ignore_above": 256
                                }
                            }
                        }
                    }
                },
                {
                    "longs_as_longs": {
                        "match_mapping_type": "long",
                        "mapping": {"type": "long"}
                    }
                },
                {
                    "dates_as_dates": {
                        "match": "*_time",                    # Tous les champs terminant par _time
                        "mapping": {
                            "type": "date",
                            "format": "strict_date_optional_time||epoch_millis"
                        }
                    }
                }
            ]
        }
    }
