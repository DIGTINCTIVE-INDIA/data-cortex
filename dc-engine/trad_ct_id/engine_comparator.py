# engine_comparator.py

def is_cross_engine(source_database_type, target_database_type):
    return source_database_type != target_database_type


def is_same_engine(source_database_type, target_database_type):
    return source_database_type == target_database_type