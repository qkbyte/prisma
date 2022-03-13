import { getCliQueryEngineType } from '@prisma/engines'
import { getPlatform } from '@prisma/get-platform'
import type { Command } from '@prisma/sdk'
import {
  arg,
  engineEnvVarMap,
  EngineType,
  format,
  getConfig,
  getSchema,
  getSchemaPath,
  getVersion,
  HelpError,
  isError,
  loadEnvFile,
  resolveEnginePath,
} from '@prisma/sdk'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'

import { getInstalledPrismaClientVersion } from './utils/getClientVersion'

const packageJson = require('../package.json') // eslint-disable-line @typescript-eslint/no-var-requires

interface EngineInfo {
  path: string
  version: string
  fromEnvVar?: string
}

/**
 * $ prisma version
 */
export class Version implements Command {
  static new(): Version {
    return new Version()
  }

  private static help = format(`
  Print current version of Prisma components

  ${chalk.bold('Usage')}

    ${chalk.dim('$')} prisma -v [options]
    ${chalk.dim('$')} prisma version [options]

  ${chalk.bold('Options')}

    -h, --help     Display this help message
        --json     Output JSON
`)

  async parse(argv: string[]): Promise<string | Error> {
    const args = arg(argv, {
      '--help': Boolean,
      '-h': '--help',
      '--version': Boolean,
      '-v': '--version',
      '--json': Boolean,
      '--telemetry-information': String,
    })

    if (isError(args)) {
      return this.help(args.message)
    }

    if (args['--help']) {
      return this.help()
    }

    loadEnvFile(undefined, true)

    const prismaClientVersion = await getInstalledPrismaClientVersion()
    const platform = await getPlatform()

    const cliQueryEngineType = getCliQueryEngineType()
    const queryEngine = await this.getEngineInfo(cliQueryEngineType)
    const migrationEngine = await this.getEngineInfo(EngineType.migrationEngine)
    const introspectionEngine = await this.getEngineInfo(EngineType.introspectionEngine)
    const fmtEngine = await this.getEngineInfo(EngineType.prismaFmt)

    const versionInfoRows = [
      [packageJson.name, packageJson.version],
      ['@prisma/client', prismaClientVersion ?? 'Not found'],
      ['Current platform', platform],
      [
        `Query Engine${cliQueryEngineType === EngineType.libqueryEngine ? ' (Node-API)' : ' (Binary)'}`,
        this.constructEngineInfoString(queryEngine),
      ],
      ['Migration Engine', this.constructEngineInfoString(migrationEngine)],
      ['Introspection Engine', this.constructEngineInfoString(introspectionEngine)],
      ['Format Engine', this.constructEngineInfoString(fmtEngine)],
      ['Studio', packageJson.devDependencies['@prisma/studio-server']],
      ['Default Engines Hash', packageJson.dependencies['@prisma/engines'].split('.').pop()],
    ]

    const schemaPath = await getSchemaPath()
    const featureFlags = await this.getFeatureFlags(schemaPath)

    if (featureFlags && featureFlags.length > 0) {
      versionInfoRows.push(['Preview Features', featureFlags.join(', ')])
    }

    return this.printTable(versionInfoRows, args['--json'])
  }

  private async getFeatureFlags(schemaPath: string | null): Promise<string[]> {
    if (!schemaPath) {
      return []
    }

    try {
      const datamodel = await getSchema()
      const config = await getConfig({
        datamodel,
      })
      const generator = config.generators.find((g) => g.previewFeatures.length > 0)
      if (generator) {
        return generator.previewFeatures
      }
    } catch (e) {
      // console.error(e)
    }
    return []
  }

  private constructEngineInfoString({ path: absolutePath, version, fromEnvVar }: EngineInfo): string {
    const resolved = fromEnvVar ? `, resolved by ${fromEnvVar}` : ''
    return `${version} (at ${path.relative(process.cwd(), absolutePath)}${resolved})`
  }

  private async getEngineInfo(engineType: EngineType): Promise<EngineInfo> {
    const envVar = engineEnvVarMap[engineType]
    const pathFromEnv = process.env[envVar]
    if (pathFromEnv && fs.existsSync(pathFromEnv)) {
      const version = await getVersion(pathFromEnv, engineType)
      return { version, path: pathFromEnv, fromEnvVar: envVar }
    }

    const enginePath = await resolveEnginePath(engineType)
    const version = await getVersion(enginePath, engineType)
    return { version, path: enginePath }
  }

  private printTable(rows: string[][], json = false): string {
    if (json) {
      const result = rows.reduce((acc, [name, value]) => {
        acc[slugify(name)] = value
        return acc
      }, {})
      return JSON.stringify(result, null, 2)
    }
    const maxPad = rows.reduce((acc, curr) => Math.max(acc, curr[0].length), 0)
    return rows.map(([left, right]) => `${left.padEnd(maxPad)} : ${right}`).join('\n')
  }

  public help(error?: string): string | HelpError {
    if (error) {
      return new HelpError(`\n${chalk.bold.red(`!`)} ${error}\n${Version.help}`)
    }

    return Version.help
  }
}

function slugify(str: string): string {
  return str.toString().toLowerCase().replace(/\s+/g, '-')
}
