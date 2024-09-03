The official repository for Running Redis on Fly.io. Find the accompanying Docker image at [flyio/redis](https://hub.docker.com/repository/docker/flyio/redis).

## Usage

This installation requires setting a password on Redis. To do that, run `fly secrets set REDIS_PASSWORD=mypassword` before deploying. Keep
track of this password - it won't be visible again after deployment!

If you need no customizations, you can deploy using the official Docker image. See `fly.toml` in this repository for an example to get started with.
## Runtime requirements

By default, this Redis installation will only accept connections on the private IPv6 network, on the standard port 6379.

If you want to access it from the public internet, add a `[[services]]` section to your `fly.toml`. An example is included in this repo for accessing Redis on port 10000.


We recommend adding persistent storage for Redis data. If you skip this step, data will be lost across deploys or restarts. For Fly apps, the volume needs to be in the same region as the app instances. For example:

```cmd
flyctl volumes create redis_server --region ord
```
```out
      Name: redis_server
    Region: ord
   Size GB: 10
Created at: 02 Nov 20 19:55 UTC
```

To connect this volume to the app, `fly.toml` includes a `[mounts]` entry.

```
[mounts]
source      = "redis_server"
destination = "/data"
```

When the app starts, that volume will be mounted on /data. 

## Cutting a release

If you have write access to this repo, you can ship a prerelease or full release with:

```
scripts/bump_version.sh
```
or
```
scripts/bump_version.sh prerel
```
