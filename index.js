#!/usr/bin/env node

const request = require('request')
const fs = require('fs-extra')
const mustache = require('mustache')
const path = require('path')

const promisify = require('es6-promisify')
const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
const ensureDir = promisify(fs.ensureDir)
const remove = promisify(fs.remove)
const copy = promisify(fs.copy)
const move = promisify(fs.move)
const symlink = promisify(fs.symlink)

const argv = require('yargs')
  .help('help')
  .string('app-asset-dir')
  .default('app-asset-dir', 'app-assets')
  .string('content-dir')
  .default('content-dir', 'contents')
  .boolean('clean')
  .default('clean', true)
  .describe('clean', 'Clean output directories')
  .argv

const appJsonSource = argv._[0] ? argv._[0] : 'in/app.json'
const appJsonSourceDir = path.dirname(appJsonSource)

const appAssetDir = argv['app-asset-dir']
const contentDir = argv['content-dir']

const maybeClean = () => {
    console.log('Cleaning out directories')
    if (!argv.clean)
        return Promise.resolve()
    return Promise.all([remove(appAssetDir), remove(contentDir)])
}

const download = (source, dest) => {
    return new Promise((resolve, reject) => {
        try {
            const pipe = request(source).pipe(fs.createWriteStream(dest))
            pipe.on('finish', resolve)
            pipe.on('end', resolve)
            pipe.on('error', reject)
            pipe.on('close', reject)
        } catch (error) {
            reject(error)
        }
    })
}

const downloadOrCopy = (sourceDir, source, outDir, filename) => {
    return ensureDir(outDir).then(() => {
        if (!source.startsWith('http'))
            source = path.join(sourceDir, source)
        if (source.startsWith('http')) {
            console.log('Downloading from', source, 'to', path.join(outDir, filename))
            return download(source, path.join(outDir, filename))
        }
        console.log('Copying from', source, 'to', path.join(outDir, filename))
        return copy(source, path.join(outDir, filename))
    })
}

const templateFile = (templatePath, params, outDir, filename) => {
    return ensureDir(outDir).then(() => {
        return readFile(templatePath)
    }).then((data) => {
        console.log('Writing out', path.join(outDir, filename))
        return writeFile(path.join(outDir, filename), mustache.render(data.toString(), params))
    })
}

const systemdBusPathEncode = (string) => {
    return string.replace(/([^A-Za-z0-9])/g, function(m) {
        return '_' + m.charCodeAt(0).toString(16);
    });
}

const templateFiles = (appJson) => {
    const params = {
        app_id: appJson.app_id,
        object_path: systemdBusPathEncode(appJson.app_id)
    }
    let tasks = [];
    tasks.push(templateFile(path.join(__dirname, 'dbus.service.in'), params,
        path.join(contentDir, 'share/dbus-1/services'), appJson.app_id + '.service'))
    tasks.push(templateFile(path.join(__dirname, 'search-provider.ini.in'), params,
        path.join(contentDir, 'share/gnome-shell/search-providers'), appJson.app_id + '-search-provider.ini'))
    return Promise.all(tasks)
}

const downloadBasicFiles = (appJson) => {
    let tasks = [];
    if (appJson.icon) {
        tasks.push(downloadOrCopy(appJsonSourceDir, appJson.icon,
            path.join(contentDir, 'share/icons/hicolor/64x64/apps'), appJson.app_id + '.png'))
        tasks.push(downloadOrCopy(appJsonSourceDir, appJson.icon,
            path.join(contentDir, 'share/app-info/icons/flatpak/64x64'), appJson.app_id + '.png'))
    }
    if (appJson.app_data) {
        tasks.push(downloadOrCopy(appJsonSourceDir, appJson.app_data,
            path.join(contentDir, 'share/app-info/xmls'), appJson.app_id + '.appdata.xml'))
    }
    if (appJson.desktop) {
        tasks.push(downloadOrCopy(appJsonSourceDir, appJson.desktop,
            path.join(contentDir, 'share/applications'), appJson.app_id + '.desktop'))
    }
    return Promise.all(tasks)
}

const ensureManifest = (appJson) => {
    if (typeof appJson.content_manifest === 'object')
        return writeFile(path.join(contentDir, 'manifest.json'), JSON.stringify(appJson.content_manifest, null, '  '))
    return downloadOrCopy(appJsonSourceDir, appJson.content_manifest, contentDir, 'manifest.json')
}

const downloadShards = (appJson, contentManifest, subscriptionDir) => {
    let contentManifestSourceDir = appJsonSourceDir
    if (appJson.content_manifest.startsWith('http'))
        contentManifestSourceDir = path.dirname(appJson.content_manifest)
    return Promise.all(contentManifest.shards.map((obj) => {
        if (obj.download_uri)
            return downloadOrCopy(contentManifestSourceDir, obj.download_uri, subscriptionDir, obj.path)
        return downloadOrCopy(contentManifestSourceDir, obj.path, subscriptionDir, obj.path)
    }))
}

const downloadContent = (appJson) => {
    return ensureManifest(appJson).then(() => {
        return readFile(path.join(contentDir, 'manifest.json')).then((data) => {
            return JSON.parse(data.toString())
        })
    }).then((contentManifest) => {
        const subscriptionId = contentManifest.subscription_id
        const eknDir = path.join(contentDir, 'share/ekn/data', appJson.app_id)
        const subscriptionDir = path.join(eknDir, 'com.endlessm.subscriptions', subscriptionId)
        const subscriptionsJsonContents = JSON.stringify({
            subscriptions: [{
                disable_updates: !!appJson.disable_subscription_updates,
                id: subscriptionId
            }]
        }, null, '  ')
        return ensureDir(subscriptionDir).then(() => {
            console.log('Writing out', path.join(eknDir, 'EKN_VERSION'))
            console.log('Writing out', path.join(eknDir, 'subscriptions.json'))
            console.log('Moving', path.join(contentDir, 'manifest.json'), 'to', path.join(subscriptionDir, 'manifest.json'))
            return Promise.all([
                move(path.join(contentDir, 'manifest.json'), path.join(subscriptionDir, 'manifest.json')),
                downloadShards(appJson, contentManifest, subscriptionDir),
                writeFile(path.join(eknDir, 'EKN_VERSION'), '3\n'),
                writeFile(path.join(eknDir, 'subscriptions.json'), subscriptionsJsonContents)
            ])
        })
    })
}

const downloadAppAssets = (appJson) => {
    return Promise.all(appJson.app_assets.map((obj) => {
        if (obj.download_uri)
            return downloadOrCopy(appJsonSourceDir, obj.download_uri, appAssetDir, obj.path)
        return downloadOrCopy(appJsonSourceDir, obj.path, appAssetDir, obj.path)
    }))
}

maybeClean().then(() => {
    return downloadOrCopy('', appJsonSource, contentDir, 'app.json')
}).then(() => {
    return readFile(path.join(contentDir, 'app.json')).then((data) => {
        return JSON.parse(data.toString())
    })
}).then((appJson) => {
    return Promise.all([
        templateFiles(appJson),
        downloadBasicFiles(appJson),
        downloadContent(appJson),
        downloadAppAssets(appJson)
    ])
}).then(() => {
    console.log('Done!')
}).catch((error) => {
    console.log(error)
    process.exit(1)
})
