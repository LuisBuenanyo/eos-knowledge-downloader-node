# eos-knowledge-downloader

The `eos-knowledge-downloader` tool is a command line utility which readies a
directory of shard content and static files for use in a EndlessOS knowledge
application. This tool assumes the app will be packaged as a flatpak, and
searchable through EndlessOS's global desktop search.

The cli tool will set up things like a gnome-shell provider and a dbus service
file which all knowledge apps should have. It downloads and properly constructs
and subscriptions directory of sharded content. Finally, it downloads any
application specific assets to a directory, making it easy to set up electron
"templates" for use with many different sets of content.

The tools operates by reading in a single app json file which describes all the
application metadata needed. This json file can be either local or a url.
Similarly, all assets referred to by the app json can be either relative to the
app jsons location, or downloaded through and external url. This should make it
very flexible where content is stored. Application content can be stored
separately from application code if so desired, and the asset content can be
stored separately shard content.

For example, you could store app code on github, assets on dropbox and shard
content on Endless's content portal. Or you could store assets and code together
on github, and custom shard content on google drive.

## Usage

```
eos-knowledge-downloader [OPTIONS...] FILENAME or URL
```

Just call the tool with a set of options and path or url to an app.json file. If
no path is supplied, the app.json is assumed to live in an `in/app.json`
directory.

## Options

 - **--app-asset-dir**: directory to store application assets. Default 'app-assets'
 - **--content-dir**: directory to store shard content and static assets. Default 'contents'
 - **--clean**: clean out the app asset dir and content dir before populating. Default `True`

## App json properties

 - **app_id**: the application id
 - **name**: display name of the application
 - **icon**: url or local path to the application icon (only 64x64 icons currently supported)
 - **desktop**: url or local path to an application desktop file
 - **app_data**: url or local path to an app stream metadata xml file
 - **app_assets**: a json array of asset objects
 - **content_manifest**: a json object, local path or url to a subscriptions manifest file

Asset object

 - **path**: the destination path of the asset within the app-asset-dir
 - **download_uri**: optional uri to download the asset from

### Example json

```json
{
  "app_id": "com.endlessm.myths.en",
  "name": "Myths",
  "icon": "icon.png",
  "app_data": "appdata.xml",
  "app_assets": [
    {
      "path": "logo.svg"
    },
    {
      "path": "background.jpg"
    }
  ],
  "content_manifest": "https://subscriptions.prod.soma.endless-cloud.com/v1/a82915cbde270d773ddd3d89246daaa7990b18b5f80913ac3a16f2c520d0f494/manifest.json",
  "disable_subscription_updates": true
}
```

### Example output
```
app-assets
├── background.jpg
└── logo.svg

contents
├── app.json
└── share
    ├── app-info
    │   ├── icons
    │   │   └── flatpak
    │   │       └── 64x64
    │   │           └── com.endlessm.myths.en.png
    │   └── xmls
    │       └── com.endlessm.myths.en.appdata.xml
    ├── dbus-1
    │   └── services
    │       └── com.endlessm.myths.en.service
    ├── ekn
    │   └── data
    │       └── com.endlessm.myths.en
    │           ├── com.endlessm.subscriptions
    │           │   └── a82915cbde270d773ddd3d89246daaa7990b18b5f80913ac3a16f2c520d0f494
    │           │       ├── e87ac3f0-54f1-11e6-b853-ff11cd9524f9.shard
    │           │       └── manifest.json
    │           ├── EKN_VERSION
    │           └── subscriptions.json
    ├── gnome-shell
    │   └── search-providers
    │       └── com.endlessm.myths.en-search-provider.ini
    └── icons
        └── hicolor
            └── 64x64
                └── apps
                    └── com.endlessm.myths.en.png
```
