#!/usr/bin/env perl
use strict;
use warnings;
use utf8;

my ($styles_path, $document_path) = @ARGV;
die "Usage: $0 word/styles.xml word/document.xml\n" unless $styles_path && $document_path;

sub slurp {
    my ($path) = @_;
    open my $fh, '<:raw', $path or die "Cannot read $path: $!";
    local $/;
    my $text = <$fh>;
    close $fh;
    return $text;
}

sub spew {
    my ($path, $text) = @_;
    open my $fh, '>:raw', $path or die "Cannot write $path: $!";
    print {$fh} $text;
    close $fh;
}

sub patch_style {
    my ($xml_ref, $style_id, $callback) = @_;
    $$xml_ref =~ s{(<w:style\b[^>]*w:styleId="$style_id"[^>]*>.*?</w:style>)}{$callback->($1)}gse;
}

my $styles = slurp($styles_path);

# Named override: thesis fragment in A4, Times New Roman, black academic headings.
my $tnr = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
$styles =~ s{<w:rFonts\b[^>]*/>}{$tnr}g;
$styles =~ s{<w:color w:val="0F4761"[^>]*/>}{<w:color w:val="000000"/>}g;

patch_style(\$styles, 'Heading1', sub {
    my $s = shift;
    $s =~ s{<w:sz w:val="\d+"/>}{<w:sz w:val="28"/>}g;
    $s =~ s{<w:szCs w:val="\d+"/>}{<w:szCs w:val="28"/>}g;
    $s =~ s{<w:spacing\b[^>]*/>}{<w:spacing w:before="0" w:after="160"/>}g;
    $s =~ s{(<w:rPr>)}{$1$tnr<w:b/><w:bCs/><w:color w:val="000000"/>} unless $s =~ /<w:b\/>/;
    return $s;
});

for my $id ('Heading2', 'Heading3') {
    patch_style(\$styles, $id, sub {
        my $s = shift;
        $s =~ s{<w:sz w:val="\d+"/>}{<w:sz w:val="24"/>}g;
        $s =~ s{<w:szCs w:val="\d+"/>}{<w:szCs w:val="24"/>}g;
        $s =~ s{<w:spacing\b[^>]*/>}{<w:spacing w:before="160" w:after="80"/>}g;
        $s =~ s{(<w:rPr>)}{$1$tnr<w:b/><w:bCs/><w:color w:val="000000"/>} unless $s =~ /<w:b\/>/;
        return $s;
    });
}

patch_style(\$styles, 'BodyText', sub {
    my $s = shift;
    $s =~ s{<w:spacing\b[^>]*/>}{<w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/>}g;
    $s =~ s{</w:pPr>}{<w:jc w:val="both"/><w:ind w:firstLine="720"/></w:pPr>} unless $s =~ /<w:jc\b/;
    return $s;
});

patch_style(\$styles, 'Compact', sub {
    my $s = shift;
    $s =~ s{<w:spacing\b[^>]*/>}{<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>}g;
    $s =~ s{</w:pPr>}{<w:jc w:val="left"/><w:ind w:firstLine="0"/></w:pPr>} unless $s =~ /<w:jc\b/;
    return $s;
});

patch_style(\$styles, 'Caption', sub {
    my $s = shift;
    $s =~ s{<w:spacing\b[^>]*/>}{<w:spacing w:before="40" w:after="120" w:line="240" w:lineRule="auto"/>}g;
    $s =~ s{<w:i\s*/>}{}g;
    $s =~ s{(<w:pPr>)}{$1<w:jc w:val="center"/><w:ind w:firstLine="0"/>} unless $s =~ /<w:jc\b/;
    $s =~ s{(<w:rPr>)}{$1$tnr<w:sz w:val="20"/><w:szCs w:val="20"/>} unless $s =~ /<w:sz\b/;
    return $s;
});

spew($styles_path, $styles);

my $document = slurp($document_path);
$document =~ s{<w:pgSz\b[^>]*/>}{<w:pgSz w:w="11906" w:h="16838"/>}g;
$document =~ s{<w:pgMar\b[^>]*/>}{<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>}g;
spew($document_path, $document);

print "Patched academic UI/UX reference styles and A4 geometry.\n";

