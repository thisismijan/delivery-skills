package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type input struct {
	Operation string            `json:"operation"`
	From      string            `json:"from,omitempty"`
	To        string            `json:"to,omitempty"`
	Files     []string          `json:"files"`
	Proposed  map[string]string `json:"proposed,omitempty"`
}

type output struct {
	OK     bool              `json:"ok"`
	Reason string            `json:"reason,omitempty"`
	Files  map[string]string `json:"files"`
}

type parsedFile struct {
	rel    string
	path   string
	source string
	file   *ast.File
}

func result(value output) {
	if value.Files == nil {
		value.Files = map[string]string{}
	}
	_ = json.NewEncoder(os.Stdout).Encode(value)
}

func fail(reason string) {
	result(output{OK: false, Reason: reason})
	os.Exit(0)
}

func cleanRelative(root, path string) (string, bool) {
	if filepath.IsAbs(path) {
		return "", false
	}
	clean := filepath.Clean(path)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", false
	}
	absolute, err := filepath.Abs(filepath.Join(root, clean))
	if err != nil {
		return "", false
	}
	base, err := filepath.Abs(root)
	if err != nil || (absolute != base && !strings.HasPrefix(absolute, base+string(filepath.Separator))) {
		return "", false
	}
	return filepath.ToSlash(clean), true
}

func parseListed(root string, names []string) ([]parsedFile, *token.FileSet, error) {
	fset := token.NewFileSet()
	files := make([]parsedFile, 0, len(names))
	for _, name := range names {
		rel, ok := cleanRelative(root, name)
		if !ok || !strings.HasSuffix(rel, ".go") {
			return nil, nil, fmt.Errorf("go helper received an invalid file")
		}
		path := filepath.Join(root, filepath.FromSlash(rel))
		source, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, fmt.Errorf("missing file: %s", rel)
		}
		file, err := parser.ParseFile(fset, path, source, parser.ParseComments)
		if err != nil {
			return nil, nil, fmt.Errorf("go source did not parse: %s", rel)
		}
		files = append(files, parsedFile{rel: rel, path: path, source: string(source), file: file})
	}
	return files, fset, nil
}

func allPackageFiles(root string, listed []parsedFile, fset *token.FileSet) ([]parsedFile, error) {
	dirs := map[string]string{}
	for _, file := range listed {
		dirs[filepath.Dir(file.path)] = file.file.Name.Name
	}
	all := []parsedFile{}
	for dir, packageName := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
				continue
			}
			path := filepath.Join(dir, entry.Name())
			source, err := os.ReadFile(path)
			if err != nil {
				return nil, err
			}
			file, err := parser.ParseFile(fset, path, source, parser.ParseComments)
			if err != nil {
				return nil, fmt.Errorf("go package source did not parse: %s", entry.Name())
			}
			if file.Name.Name != packageName {
				continue
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return nil, err
			}
			all = append(all, parsedFile{
				rel: filepath.ToSlash(rel), path: path, source: string(source), file: file,
			})
		}
	}
	return all, nil
}

func declaredNames(file *ast.File) []*ast.Ident {
	var names []*ast.Ident
	ast.Inspect(file, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.FuncDecl:
			names = append(names, value.Name)
		case *ast.TypeSpec:
			names = append(names, value.Name)
		case *ast.ValueSpec:
			names = append(names, value.Names...)
		case *ast.AssignStmt:
			if value.Tok == token.DEFINE {
				for _, expression := range value.Lhs {
					if ident, ok := expression.(*ast.Ident); ok {
						names = append(names, ident)
					}
				}
			}
		case *ast.RangeStmt:
			if value.Tok == token.DEFINE {
				for _, expression := range []ast.Expr{value.Key, value.Value} {
					if ident, ok := expression.(*ast.Ident); ok {
						names = append(names, ident)
					}
				}
			}
		case *ast.Field:
			names = append(names, value.Names...)
		}
		return true
	})
	return names
}

func rewriteIdentifiers(source string, offsets [][2]int, to string) string {
	sort.Slice(offsets, func(i, j int) bool { return offsets[i][0] > offsets[j][0] })
	next := source
	for _, offset := range offsets {
		next = next[:offset[0]] + to + next[offset[1]:]
	}
	return next
}

func rename(root string, in input) output {
	if !token.IsIdentifier(in.From) || !token.IsIdentifier(in.To) || in.From == in.To {
		return output{OK: false, Reason: "go rename needs two different identifiers"}
	}
	if ast.IsExported(in.From) {
		return output{OK: false, Reason: "go rename cannot prove references to an exported identifier"}
	}
	listed, fset, err := parseListed(root, in.Files)
	if err != nil {
		return output{OK: false, Reason: err.Error()}
	}
	all, err := allPackageFiles(root, listed, fset)
	if err != nil {
		return output{OK: false, Reason: "go package graph was not proven"}
	}
	declarations := 0
	for _, file := range all {
		for _, name := range declaredNames(file.file) {
			if name.Name == in.From {
				declarations++
			}
			if name.Name == in.To {
				return output{OK: false, Reason: "go rename target is already declared"}
			}
		}
	}
	if declarations != 1 {
		return output{OK: false, Reason: "go rename source is missing or ambiguous"}
	}
	listedSet := map[string]bool{}
	for _, file := range listed {
		listedSet[file.rel] = true
	}
	changes := map[string]string{}
	for _, file := range all {
		offsets := [][2]int{}
		ast.Inspect(file.file, func(node ast.Node) bool {
			ident, ok := node.(*ast.Ident)
			if !ok || ident.Name != in.From {
				return true
			}
			position := fset.Position(ident.Pos())
			offsets = append(offsets, [2]int{position.Offset, position.Offset + len(in.From)})
			return true
		})
		if len(offsets) == 0 {
			continue
		}
		if !listedSet[file.rel] {
			return output{OK: false, Reason: "go rename has references in files that were not listed"}
		}
		changes[file.rel] = rewriteIdentifiers(file.source, offsets, in.To)
	}
	if len(changes) == 0 {
		return output{OK: false, Reason: "go rename source was not found"}
	}
	return output{OK: true, Files: changes}
}

type importRange struct {
	start int
	end   int
	name  string
	path  string
}

func imports(file parsedFile, fset *token.FileSet) ([]importRange, error) {
	var values []importRange
	for _, spec := range file.file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			return nil, err
		}
		name := filepath.Base(path)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		start := fset.Position(spec.Pos()).Offset
		end := fset.Position(spec.End()).Offset
		values = append(values, importRange{start: start, end: end, name: name, path: path})
	}
	return values, nil
}

func importRemovals(file parsedFile, fset *token.FileSet, used map[string]bool) ([][2]int, error) {
	remove := [][2]int{}
	for _, declaration := range file.file.Decls {
		gen, ok := declaration.(*ast.GenDecl)
		if !ok || gen.Tok != token.IMPORT {
			continue
		}
		unused := []*ast.ImportSpec{}
		for _, raw := range gen.Specs {
			spec := raw.(*ast.ImportSpec)
			path, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				return nil, err
			}
			name := filepath.Base(path)
			if spec.Name != nil {
				name = spec.Name.Name
			}
			if name != "_" && name != "." && !used[name] {
				start := fset.Position(spec.Pos()).Offset
				end := fset.Position(spec.End()).Offset
				if strings.Contains(file.source[start:end], "//") || strings.Contains(file.source[start:end], "/*") {
					return nil, fmt.Errorf("go import-only cannot prove a commented import")
				}
				unused = append(unused, spec)
			}
		}
		if len(unused) == 0 {
			continue
		}
		if len(unused) == len(gen.Specs) {
			remove = append(remove, [2]int{
				fset.Position(gen.Pos()).Offset,
				fset.Position(gen.End()).Offset,
			})
			continue
		}
		for _, spec := range unused {
			remove = append(remove, [2]int{
				fset.Position(spec.Pos()).Offset,
				fset.Position(spec.End()).Offset,
			})
		}
	}
	return remove, nil
}

func usedImportNames(file *ast.File) map[string]bool {
	used := map[string]bool{}
	ast.Inspect(file, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if ident, ok := selector.X.(*ast.Ident); ok {
			used[ident.Name] = true
		}
		return true
	})
	return used
}

func formatSource(source string) (string, error) {
	next, err := format.Source([]byte(source))
	return string(next), err
}

func modulePath(root string) (string, error) {
	raw, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(raw), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == "module" {
			return fields[1], nil
		}
	}
	return "", fmt.Errorf("go.mod has no module path")
}

func localPackages(root string) map[string][]string {
	packages := map[string][]string{}
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return filepath.SkipDir
		}
		if entry.IsDir() {
			if path != root && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "vendor") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		fset := token.NewFileSet()
		file, parseErr := parser.ParseFile(fset, path, nil, parser.PackageClauseOnly)
		if parseErr != nil {
			return nil
		}
		dir, relErr := filepath.Rel(root, filepath.Dir(path))
		if relErr == nil {
			packages[file.Name.Name] = append(packages[file.Name.Name], filepath.ToSlash(dir))
		}
		return nil
	})
	for name := range packages {
		packages[name] = unique(packages[name])
	}
	return packages
}

func unique(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func missingPackageNames(file parsedFile) []string {
	imported := map[string]bool{}
	for _, spec := range file.file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		name := filepath.Base(path)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		imported[name] = true
	}
	declared := map[string]bool{file.file.Name.Name: true}
	for _, name := range declaredNames(file.file) {
		declared[name.Name] = true
	}
	missing := []string{}
	ast.Inspect(file.file, func(node ast.Node) bool {
		selector, ok := node.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		if ident, ok := selector.X.(*ast.Ident); ok && !imported[ident.Name] && !declared[ident.Name] {
			missing = append(missing, ident.Name)
		}
		return true
	})
	return unique(missing)
}

func importOnly(root string, in input) output {
	listed, fset, err := parseListed(root, in.Files)
	if err != nil {
		return output{OK: false, Reason: err.Error()}
	}
	changes := map[string]string{}
	module, moduleErr := modulePath(root)
	packages := localPackages(root)
	for _, file := range listed {
		used := usedImportNames(file.file)
		remove, err := importRemovals(file, fset, used)
		if err != nil {
			return output{OK: false, Reason: err.Error()}
		}
		next := rewriteIdentifiers(file.source, remove, "")
		add := []string{}
		if moduleErr == nil {
			for _, name := range missingPackageNames(file) {
				candidates := packages[name]
				if len(candidates) == 1 && candidates[0] != "." {
					add = append(add, fmt.Sprintf("import %q\n", module+"/"+candidates[0]))
				}
			}
		}
		if len(add) > 0 {
			offset := fset.Position(file.file.Name.End()).Offset
			next = next[:offset] + "\n\n" + strings.Join(add, "") + next[offset:]
		}
		if len(remove) == 0 && len(add) == 0 {
			continue
		}
		next, err = formatSource(next)
		if err != nil {
			return output{OK: false, Reason: "go import rewrite was not proven"}
		}
		changes[file.rel] = next
	}
	return output{OK: true, Files: changes}
}

func formatOnly(root string, in input) output {
	listed, _, err := parseListed(root, in.Files)
	if err != nil {
		return output{OK: false, Reason: err.Error()}
	}
	changes := map[string]string{}
	for _, file := range listed {
		next, err := formatSource(file.source)
		if err != nil {
			return output{OK: false, Reason: "go format rewrite was not proven"}
		}
		if next != file.source {
			changes[file.rel] = next
		}
	}
	return output{OK: true, Files: changes}
}

func main() {
	if len(os.Args) != 3 {
		fail("usage: go-mechanical-edit.go <repoRoot> <input.json>")
	}
	root, err := filepath.Abs(os.Args[1])
	if err != nil {
		fail("repository root was not resolved")
	}
	raw, err := os.ReadFile(os.Args[2])
	if err != nil {
		fail("input was not read")
	}
	var in input
	if json.Unmarshal(raw, &in) != nil {
		fail("input was not valid JSON")
	}
	var out output
	switch in.Operation {
	case "rename":
		out = rename(root, in)
	case "import-only":
		out = importOnly(root, in)
	case "format-only":
		out = formatOnly(root, in)
	default:
		out = output{OK: false, Reason: "go operation is not supported"}
	}
	result(out)
}
