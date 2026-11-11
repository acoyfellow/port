{
  description = "port nix-git box: Pi tool server with a git that cannot force-push";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/c7def046b9a883d46974757852106483d741586f";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      patch = ./nix/refuse-forced-ref-updates.patch;
      git = (pkgs.git.override {
        withManual = false;
        osxkeychainSupport = false;
        pythonSupport = false;
        perlSupport = false;
        rustSupport = false;
        withpcre2 = false;
        sendEmailSupport = false;
        svnSupport = false;
        guiSupport = false;
      }).overrideAttrs (old: {
        patches = (old.patches or [ ]) ++ [ patch ];
        doCheck = false;
        doInstallCheck = false;
      });
      node = pkgs.nodejs-slim_22;
      piEnv = (pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_22; }) {
        pname = "port-pi-env";
        version = "1.4.0";
        src = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.unions [ ./package.json ./package-lock.json ./env-server.mjs ];
        };
        npmDepsHash = "sha256-5SDMKNOqRTwbtxFpQKliJrlAnC1aiIC92+8Zak48pNM=";
        dontNpmBuild = true;
        installPhase = ''
          mkdir -p $out/opt/pi-env
          cp -r node_modules package.json env-server.mjs $out/opt/pi-env/
        '';
        dontFixup = true;
      };
      tools = pkgs.buildEnv {
        name = "nix-git-tools";
        paths = [
          git
          node
          pkgs.ripgrep
          pkgs.bashInteractive
          pkgs.coreutils
          pkgs.findutils
          pkgs.gnugrep
          pkgs.gnused
          pkgs.cacert
        ];
      };
      patchSha = builtins.hashFile "sha256" patch;
    in
    {
      packages.${system} = {
        inherit git piEnv tools;
        image = pkgs.dockerTools.buildImage {
          name = "pi-nix-git-box";
          tag = "latest";
          copyToRoot = [ tools piEnv ];
          extraCommands = ''
            mkdir -p tmp workspace
            chmod 1777 tmp
            printf '{"git_store_path":"%s","patch_sha256":"%s","tools_store_path":"%s"}\n' \
              "${git}" "${patchSha}" "${tools}" > nix-git.json
          '';
          config = {
            Cmd = [ "${node}/bin/node" "/opt/pi-env/env-server.mjs" ];
            WorkingDir = "/workspace";
            ExposedPorts = { "8080/tcp" = { }; };
            Env = [
              "PATH=/bin"
              "HOME=/tmp"
              "PI_ENV_ROOT=/workspace"
              "PI_ENV_PORT=8080"
              "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              "GIT_PATH=${git}/bin/git"
            ];
          };
        };
      };
    };
}
