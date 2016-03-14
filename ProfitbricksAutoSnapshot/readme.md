# Backup-Solution for Profitbricks Storages
This tool creates and removes snapshots, so that always n up to date versions of a volume exist.

It uses the Profitbricks API to read, create and delete snapshots of volumes.

Please note, that open files or cached writes can sometimes produce temporary inconsistent data on a volume. Sometimes a snaphot can contain one of these inconsistent data blocks. Normally software (specially databases) can handle these issues and recover from them, but in very seldom cirumstances the snapshots are worthless. If you rely on 100% consistent application data on disk, this approach is not for you.
## help example
    $ docker run --rm freiit/profitbricksautosnapshot
## list volumes - example
    $ docker run --rm freiit/profitbricksautosnapshot --list --user=frei+pbdocker@frei-services.de --password=xxx
## create a snapshot when necessary - example
    $ docker run --rm freiit/profitbricksautosnapshot --snap --backupIntervalHours=24 --storageUUID=24684c34-1820-45f7-a478-6b9a262fcd50 --user=frei+pbdocker@frei-services.de --password=xxx --verbose
## remove snapshots when necessary - example
    $ docker run --rm freiit/profitbricksautosnapshot --del --storageUUID=24684c34-1820-45f7-a478-6b9a262fcd50 --noOfSnapshotsToKeep=2 --user=frei+pbdocker@frei-services.de --password=xxx --verbose
## do both
    $ docker run --rm freiit/profitbricksautosnapshot --snap --del --storageUUID=24684c34-1820-45f7-a478-6b9a262fcd50 --noOfSnapshotsToKeep=2 --backupIntervalHours=24 --user=frei+pbdocker@frei-services.de --password=xxx --verbose
## as a server, endlessly - example
    $ docker run --rm freiit/profitbricksautosnapshot --server --checkIntervalMinutes=60 --snap --del --storageUUID=24684c34-1820-45f7-a478-6b9a262fcd50 --noOfSnapshotsToKeep=2 --backupIntervalHours=24 --user=frei+pbdocker@frei-services.de --password=xxx --verbose
