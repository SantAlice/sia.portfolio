"""Build a verified delta while keeping every release independent."""
import hashlib
from pathlib import PurePosixPath
import tarfile


def build_delta(source, destination, existing):
    hashes = {}
    reuse = []
    with tarfile.open(source, 'r:gz') as full, tarfile.open(destination, 'w:gz', compresslevel=1) as delta:
        for member in full:
            path = PurePosixPath(member.name)
            if not member.isfile() or path.is_absolute() or '..' in path.parts:
                raise ValueError('Release must contain only relative regular files.')
            if member.name in hashes:
                raise ValueError('Duplicate release file.')
            with full.extractfile(member) as content:
                digest = hashlib.file_digest(content, 'sha256').hexdigest()
            hashes[member.name] = digest
            if existing.get(member.name) == digest:
                reuse.append(member.name)
            else:
                with full.extractfile(member) as content:
                    delta.addfile(member, content)
    return {'hashes': hashes, 'reuse': reuse}
